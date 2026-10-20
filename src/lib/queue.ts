import amqp from "amqplib";
import type { ChannelModel, ConfirmChannel } from "amqplib";

/**
 * RabbitMQ publisher for MentorHer background jobs.
 *
 * - Lazy singleton connection (same global pattern as cache.ts / mongoose).
 * - Confirm channel + persistent messages: publishNotification() only returns
 *   true after the broker has acknowledged the message.
 * - Never throws. When the broker is unavailable we log once (warnOnce-style),
 *   back off for a few seconds, and return false so callers can fall back to a
 *   direct DB write — the API contract never depends on RabbitMQ being up.
 *
 * Env (read at call time, never hardcoded):
 *   RABBITMQ_URL      e.g. amqp://guest:guest@127.0.0.1:5672  (unset => disabled)
 *   RABBITMQ_ENABLED  "false" to hard-disable publishing
 */

export const QUEUE_WORK = "mentorher.notifications";
export const QUEUE_RETRY = "mentorher.notifications.retry";
export const QUEUE_DLQ = "mentorher.notifications.dlq";

/** Delay before the publisher retries a connection after a failure. */
const RECONNECT_BACKOFF_MS = 5000;
const CONNECT_TIMEOUT_MS = 5000;

/**
 * A background job that produces one or more in-app notifications.
 * Carries ids only — never names, message content, tokens, or other PII.
 * The worker hydrates display details from MongoDB.
 */
export interface NotificationJob {
  /** Deterministic idempotency key: notif:<type>:<targetId>:<recipientId> */
  jobId: string;
  type: string;
  /** User who caused the event. */
  actorId: string;
  /** The entity the event is about (request/message id). */
  targetId: string;
  /** User to notify (omitted for fan-out jobs like group messages). */
  recipientId?: string;
  /** Small non-sensitive discriminator (e.g. "dm", "group", status). */
  context?: string;
}

interface QueueGlobal {
  conn?: ChannelModel | null;
  channel?: ConfirmChannel | null;
  warned?: boolean;
  nextAttemptAt?: number;
}
declare global {
  var __mentorherQueue: QueueGlobal | undefined;
}
const q: QueueGlobal = (globalThis.__mentorherQueue ??= {});

function isEnabled(): boolean {
  if (process.env.RABBITMQ_ENABLED === "false") return false;
  return Boolean(process.env.RABBITMQ_URL);
}

function resetConnection(message: string): void {
  const ch = q.channel;
  const conn = q.conn;
  q.channel = null;
  q.conn = null;
  q.nextAttemptAt = Date.now() + RECONNECT_BACKOFF_MS;
  try {
    void ch?.close();
  } catch {
    /* already broken */
  }
  try {
    void conn?.close();
  } catch {
    /* already broken */
  }
  if (!q.warned) {
    q.warned = true;
    // Never log the URL (it embeds credentials) — message text only.
    console.warn("[queue] publish unavailable — falling back to direct write:", message);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`connect timeout after ${ms}ms`)), ms);
    (timer as any).unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Returns a connected confirm channel with the topology asserted, or null. */
async function getChannel(): Promise<ConfirmChannel | null> {
  if (!isEnabled()) return null;
  if (q.nextAttemptAt && Date.now() < q.nextAttemptAt) return null; // backoff window
  if (q.channel) return q.channel;

  try {
    const conn = await withTimeout(amqp.connect(process.env.RABBITMQ_URL as string), CONNECT_TIMEOUT_MS);
    conn.on("error", (err: Error) => resetConnection(err?.message ?? "connection error"));
    conn.on("close", () => {
      if (q.conn === conn) {
        q.channel = null;
        q.conn = null;
      }
    });

    const ch = await conn.createConfirmChannel();
    // Durable topology (idempotent asserts):
    //   work -> (nack/failed settle) -> DLQ, retry --TTL--> work
    await ch.assertQueue(QUEUE_WORK, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUE_DLQ,
      },
    });
    await ch.assertQueue(QUEUE_RETRY, {
      durable: true,
      arguments: {
        "x-message-ttl": 5000,
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUE_WORK,
      },
    });
    await ch.assertQueue(QUEUE_DLQ, { durable: true });

    q.conn = conn;
    q.channel = ch;
    if (q.warned) console.info("[queue] RabbitMQ reconnected");
    q.warned = false;
    return ch;
  } catch (err) {
    resetConnection(err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Publish one notification job to the work queue (persistent + confirmed).
 * Returns false when disabled, unavailable, or the publish could not be
 * confirmed — callers should then fall back to a direct DB write.
 */
export async function publishNotification(job: NotificationJob): Promise<boolean> {
  const ch = await getChannel();
  if (!ch) return false;
  try {
    const content = Buffer.from(JSON.stringify(job));
    ch.sendToQueue(QUEUE_WORK, content, {
      persistent: true,
      messageId: job.jobId,
      contentType: "application/json",
      timestamp: Date.now(),
    });
    await ch.waitForConfirms();
    return true;
  } catch (err) {
    resetConnection(err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Test/ops helper: drop the shared connection so the next call re-initialises. */
export async function closeQueue(): Promise<void> {
  const ch = q.channel;
  const conn = q.conn;
  q.channel = null;
  q.conn = null;
  q.warned = false;
  q.nextAttemptAt = 0;
  if (ch) {
    try {
      await ch.close();
    } catch {
      /* ignore */
    }
  }
  if (conn) {
    try {
      await conn.close();
    } catch {
      /* ignore */
    }
  }
}
