import mongoose from "mongoose";
import Notification from "../models/Notification";
import SessionRequest from "../models/SessionRequest";
import Message from "../models/Message";
import Group from "../models/Group";
import User from "../models/User";
import Mentor2 from "../models/Mentor2";
import Mentee from "../models/Mentee";
import { publishNotification, type NotificationJob } from "./queue";

export type { NotificationJob };

/**
 * In-app notification creation + job handling.
 *
 * - `dispatchNotification` is what API routes call: publish to RabbitMQ and,
 *   if the broker is down, run the job synchronously so the notification is
 *   never lost. Never throws — notifications must not break API contracts.
 * - `handleNotificationJob` hydrates ids from MongoDB and writes notification
 *   docs. Duplicate jobIds are detected via the unique index (E11000) and
 *   treated as success, so redelivered messages have no double side effects.
 *
 * Worker-safe: relative imports only (no @/ alias), no Next.js APIs.
 */

/** Job content is invalid/unrecoverable — consumers should dead-letter it. */
export class MalformedJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedJobError";
  }
}

export interface JobOutcome {
  created: number;
  skipped: number;
}

const PREVIEW_LENGTH = 60;

function isValidId(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function preview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_LENGTH) return flat;
  return flat.slice(0, PREVIEW_LENGTH - 3) + "...";
}

/** Display name for a user id: profile name -> username -> generic fallback. */
async function displayName(userId: string): Promise<string> {
  if (!isValidId(userId)) return "Someone";
  try {
    const [user, mentor, mentee] = (await Promise.all([
      User.findById(userId).select("username").lean(),
      Mentor2.findOne({ userId }).select("fullName").lean(),
      Mentee.findOne({ userId }).select("fullName").lean(),
    ])) as Array<{ fullName?: string; username?: string } | null>;
    return mentor?.fullName || mentee?.fullName || user?.username || "Someone";
  } catch {
    return "Someone";
  }
}

/**
 * Insert one notification. Duplicate jobId (code 11000) => already delivered,
 * count it as skipped instead of an error. Any other error propagates so the
 * consumer can classify it as transient and retry.
 */
async function insertOne(doc: {
  userId: string;
  actorId: string;
  type: string;
  targetId: string;
  text: string;
  jobId: string;
}): Promise<JobOutcome> {
  try {
    await Notification.create(doc);
    return { created: 1, skipped: 0 };
  } catch (err: any) {
    if (err?.code === 11000 || err?.cause?.code === 11000 || err?.error?.code === 11000) {
      return { created: 0, skipped: 1 };
    }
    throw err;
  }
}

/**
 * Process one job: hydrate details from MongoDB and write notification(s).
 * Throws MalformedJobError for invalid/permanently-missing data (=> DLQ),
 * and transient errors (e.g. Mongo down) for the consumer to retry.
 */
export async function handleNotificationJob(job: NotificationJob): Promise<JobOutcome> {
  if (!job || typeof job !== "object") throw new MalformedJobError("job is not an object");
  if (typeof job.jobId !== "string" || job.jobId.length === 0) throw new MalformedJobError("missing jobId");
  if (typeof job.type !== "string" || job.type.length === 0) throw new MalformedJobError("missing type");
  if (!isValidId(job.actorId)) throw new MalformedJobError("missing or invalid actorId");
  if (!isValidId(job.targetId)) throw new MalformedJobError("missing or invalid targetId");

  switch (job.type) {
    case "session_request.created": {
      if (!isValidId(job.recipientId)) throw new MalformedJobError("missing recipientId");
      if (job.recipientId === job.actorId) return { created: 0, skipped: 1 };
      const request = (await SessionRequest.findById(job.targetId).lean()) as { topic: string; status?: string } | null;
      if (!request) throw new MalformedJobError("session request not found");
      const name = await displayName(job.actorId);
      return insertOne({
        userId: job.recipientId,
        actorId: job.actorId,
        type: job.type,
        targetId: job.targetId,
        text: `${name} sent you a session request "${request.topic}"`,
        jobId: job.jobId,
      });
    }

    case "session_request.updated": {
      if (!isValidId(job.recipientId)) throw new MalformedJobError("missing recipientId");
      if (job.recipientId === job.actorId) return { created: 0, skipped: 1 };
      const request = (await SessionRequest.findById(job.targetId).lean()) as { topic: string; status?: string } | null;
      if (!request) throw new MalformedJobError("session request not found");
      const name = await displayName(job.actorId);
      const verb =
        request.status === "accepted"
          ? `accepted`
          : request.status === "declined"
            ? `declined`
            : `marked as ${request.status}`;
      return insertOne({
        userId: job.recipientId,
        actorId: job.actorId,
        type: job.type,
        targetId: job.targetId,
        text: `${name} ${verb} your session request "${request.topic}"`,
        jobId: job.jobId,
      });
    }

    case "dm.created": {
      if (!isValidId(job.recipientId)) throw new MalformedJobError("missing recipientId");
      if (job.recipientId === job.actorId) return { created: 0, skipped: 1 };
      const message = (await Message.findById(job.targetId).lean()) as { content?: string; group?: unknown } | null;
      if (!message || !message.content) throw new MalformedJobError("message not found");
      const name = await displayName(job.actorId);
      return insertOne({
        userId: job.recipientId,
        actorId: job.actorId,
        type: job.type,
        targetId: job.targetId,
        text: `${name} sent you a message: "${preview(message.content)}"`,
        jobId: job.jobId,
      });
    }

    case "group_message.created": {
      const message = (await Message.findById(job.targetId).lean()) as { content?: string; group?: unknown } | null;
      if (!message || !message.group || !message.content) throw new MalformedJobError("group message not found");
      const group = (await Group.findById(message.group).lean()) as { name?: string; participants?: unknown[] } | null;
      if (!group) throw new MalformedJobError("group not found");
      const name = await displayName(job.actorId);
      const groupName = group.name || "the group";
      const text = `${name} posted a new message in "${groupName}": "${preview(message.content)}"`;
      const baseJobId = `notif:group_message.created:${job.targetId}`;

      let created = 0;
      let skipped = 0;
      for (const participant of group.participants ?? []) {
        const recipientId = String(participant);
        if (recipientId === job.actorId) {
          skipped += 1;
          continue;
        }
        const outcome = await insertOne({
          userId: recipientId,
          actorId: job.actorId,
          type: job.type,
          targetId: job.targetId,
          text,
          jobId: `${baseJobId}:${recipientId}`,
        });
        created += outcome.created;
        skipped += outcome.skipped;
      }
      return { created, skipped };
    }

    default:
      throw new MalformedJobError(`unknown job type "${job.type}"`);
  }
}

/**
 * Publish a notification job; if the broker is unavailable, run the job
 * synchronously so the notification still lands. Never throws — a notification
 * failure must never fail the API request that triggered it.
 */
export async function dispatchNotification(job: NotificationJob): Promise<void> {
  try {
    const published = await publishNotification(job);
    if (published) return;
  } catch (err) {
    // publishNotification never throws, but stay defensive.
    console.warn("[queue] publish raised:", err instanceof Error ? err.message : err);
  }
  try {
    const outcome = await handleNotificationJob(job);
    console.info(
      `[queue] fallback write for ${job.jobId}: created=${outcome.created} skipped=${outcome.skipped}`
    );
  } catch (err) {
    console.warn(
      "[queue] fallback notification write failed:",
      err instanceof Error ? err.message : err
    );
  }
}
