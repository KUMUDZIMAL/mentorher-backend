import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memoryBroker } from "./memory-amqp";

// ---------------------------------------------------------------------------
// In-memory fakes for the models notifications.ts touches.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const state = {
    requests: new Map<string, any>(),
    messages: new Map<string, any>(),
    groups: new Map<string, any>(),
    users: new Map<string, any>(),
    notifications: [] as any[],
    /** When true, Notification.create throws a transient network error. */
    failCreate: false,
    reset() {
      this.requests.clear();
      this.messages.clear();
      this.groups.clear();
      this.users.clear();
      this.notifications = [];
      this.failCreate = false;
    },
  };
  return { state };
});

vi.mock("../../models/SessionRequest", () => ({
  default: {
    findById: (id: string) => ({ lean: async () => h.state.requests.get(id) ?? null }),
  },
}));

vi.mock("../../models/Message", () => ({
  default: {
    findById: (id: string) => ({ lean: async () => h.state.messages.get(id) ?? null }),
  },
}));

vi.mock("../../models/Group", () => ({
  default: {
    findById: (id: string) => ({ lean: async () => h.state.groups.get(id) ?? null }),
  },
}));

vi.mock("../../models/User", () => ({
  default: {
    findById: (id: string) => ({
      select: () => ({ lean: async () => h.state.users.get(id) ?? null }),
    }),
  },
}));

vi.mock("../../models/Mentor2", () => ({
  default: {
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
  },
}));

vi.mock("../../models/Mentee", () => ({
  default: {
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
  },
}));

vi.mock("../../models/Notification", () => ({
  default: {
    create: async (doc: any) => {
      if (h.state.failCreate) {
        throw new Error("MongoNetworkError: connection timed out");
      }
      if (h.state.notifications.some((n) => n.jobId === doc.jobId)) {
        const err: any = new Error("E11000 duplicate key error collection: notifications");
        err.code = 11000;
        throw err;
      }
      h.state.notifications.push(doc);
      return doc;
    },
  },
}));

vi.mock("amqplib", () => ({
  default: {
    connect: (url?: string) => memoryBroker.connect(url),
  },
}));

import {
  handleNotificationJob,
  dispatchNotification,
  MalformedJobError,
} from "../notifications";
import { processNotificationMessage, MAX_ATTEMPTS } from "../consumer";
import { closeQueue } from "../queue";

// Ids (valid 24-hex ObjectIds).
const REQUEST = "655f0000000000000000000a";
const MENTEE = "655f0000000000000000000b"; // actor for created / recipient for updated
const MENTOR = "655f0000000000000000000c"; // recipient for created
const MSG = "655f0000000000000000000d";
const GROUP = "655f0000000000000000000e";
const U2 = "655f0000000000000000000f";
const U3 = "655f00000000000000000010";

function seed() {
  h.state.requests.set(REQUEST, { topic: "DSA help", status: "pending" });
  h.state.messages.set(MSG, { content: "Hello there", group: null });
  h.state.groups.set(GROUP, { name: "Study Circle", participants: [MENTEE, U2, U3] });
  h.state.users.set(MENTEE, { username: "kumud" });
  h.state.users.set(U2, { username: "alex" });
}

beforeEach(async () => {
  await closeQueue();
  memoryBroker.reset();
  h.state.reset();
  seed();
  process.env.RABBITMQ_URL = "amqp://guest:guest@127.0.0.1:5672";
  process.env.RABBITMQ_ENABLED = "true";
});

afterEach(async () => {
  await closeQueue();
  delete process.env.RABBITMQ_URL;
  delete process.env.RABBITMQ_ENABLED;
});

// ---------------------------------------------------------------------------
describe("handleNotificationJob — successful processing", () => {
  it("request.created notifies the mentor with hydrated text", async () => {
    const outcome = await handleNotificationJob({
      jobId: `notif:request.created:${REQUEST}:${MENTOR}`,
      type: "session_request.created",
      actorId: MENTEE,
      targetId: REQUEST,
      recipientId: MENTOR,
    });
    expect(outcome).toEqual({ created: 1, skipped: 0 });
    expect(h.state.notifications[0]).toMatchObject({
      userId: MENTOR,
      actorId: MENTEE,
      type: "session_request.created",
      jobId: `notif:request.created:${REQUEST}:${MENTOR}`,
      text: 'kumud sent you a session request "DSA help"',
    });
  });

  it("request.updated notifies the mentee of the status change", async () => {
    h.state.requests.set(REQUEST, { topic: "DSA help", status: "accepted" });
    h.state.users.set(MENTOR, { username: "sara" });
    const outcome = await handleNotificationJob({
      jobId: `notif:request.updated:${REQUEST}:${MENTEE}:accepted`,
      type: "session_request.updated",
      actorId: MENTOR,
      targetId: REQUEST,
      recipientId: MENTEE,
      context: "accepted",
    });
    expect(outcome.created).toBe(1);
    expect(h.state.notifications[0]).toMatchObject({
      userId: MENTEE,
      text: 'sara accepted your session request "DSA help"',
    });
  });

  it("dm.created notifies the receiver with a 60-char preview", async () => {
    h.state.messages.set(MSG, { content: "hey ".repeat(50), group: null });
    const outcome = await handleNotificationJob({
      jobId: `notif:dm.created:${MSG}:${MENTOR}`,
      type: "dm.created",
      actorId: MENTEE,
      targetId: MSG,
      recipientId: MENTOR,
    });
    expect(outcome.created).toBe(1);
    const text: string = h.state.notifications[0].text;
    const quoted = text.slice(text.indexOf('"') + 1, text.lastIndexOf('"'));
    expect(quoted).toHaveLength(60);
    expect(quoted.endsWith("...")).toBe(true);
  });

  it("group_message.created fans out to participants minus the sender", async () => {
    h.state.messages.set(MSG, { content: "Hello there", group: GROUP });
    const outcome = await handleNotificationJob({
      jobId: `notif:group_message.created:${MSG}`,
      type: "group_message.created",
      actorId: MENTEE,
      targetId: MSG,
    });
    expect(outcome).toEqual({ created: 2, skipped: 1 });
    expect(h.state.notifications).toHaveLength(2);
    const recipients = h.state.notifications.map((n) => n.userId).sort();
    expect(recipients).toEqual([U2, U3].sort());
    // Per-recipient idempotency keys.
    expect(h.state.notifications.map((n) => n.jobId).sort()).toEqual(
      [`notif:group_message.created:${MSG}:${U2}`, `notif:group_message.created:${MSG}:${U3}`].sort()
    );
    expect(h.state.notifications[0].text).toContain('posted a new message in "Study Circle"');
  });

  it("never notifies the actor about their own action", async () => {
    const outcome = await handleNotificationJob({
      jobId: `notif:dm.created:${MSG}:${MENTEE}`,
      type: "dm.created",
      actorId: MENTEE,
      targetId: MSG,
      recipientId: MENTEE, // self-DM
    });
    expect(outcome).toEqual({ created: 0, skipped: 1 });
    expect(h.state.notifications).toHaveLength(0);
  });
});

describe("handleNotificationJob — duplicate handling", () => {
  it("redelivered job does not create a second notification", async () => {
    const job = {
      jobId: `notif:request.created:${REQUEST}:${MENTOR}`,
      type: "session_request.created",
      actorId: MENTEE,
      targetId: REQUEST,
      recipientId: MENTOR,
    };
    const first = await handleNotificationJob(job);
    const second = await handleNotificationJob(job); // simulated redelivery
    expect(first).toEqual({ created: 1, skipped: 0 });
    expect(second).toEqual({ created: 0, skipped: 1 });
    expect(h.state.notifications).toHaveLength(1);
  });

  it("group fan-out redelivery creates no duplicates", async () => {
    h.state.messages.set(MSG, { content: "Hello there", group: GROUP });
    const job = {
      jobId: `notif:group_message.created:${MSG}`,
      type: "group_message.created",
      actorId: MENTEE,
      targetId: MSG,
    };
    await handleNotificationJob(job);
    const second = await handleNotificationJob(job);
    expect(second).toEqual({ created: 0, skipped: 3 }); // 2 already exist + sender skip
    expect(h.state.notifications).toHaveLength(2);
  });
});

describe("handleNotificationJob — permanent failures (=> DLQ)", () => {
  it("rejects unknown job types", async () => {
    await expect(
      handleNotificationJob({
        jobId: "notif:weird:x",
        type: "nope.created",
        actorId: MENTEE,
        targetId: REQUEST,
      })
    ).rejects.toBeInstanceOf(MalformedJobError);
  });

  it("rejects jobs without a recipient where one is required", async () => {
    await expect(
      handleNotificationJob({
        jobId: `notif:request.created:${REQUEST}`,
        type: "session_request.created",
        actorId: MENTEE,
        targetId: REQUEST,
      })
    ).rejects.toBeInstanceOf(MalformedJobError);
  });

  it("rejects invalid target ids", async () => {
    await expect(
      handleNotificationJob({
        jobId: "notif:request.created:x:y",
        type: "session_request.created",
        actorId: MENTEE,
        targetId: "not-an-id",
        recipientId: MENTOR,
      })
    ).rejects.toBeInstanceOf(MalformedJobError);
  });

  it("rejects jobs whose target no longer exists", async () => {
    h.state.requests.delete(REQUEST);
    await expect(
      handleNotificationJob({
        jobId: `notif:request.created:${REQUEST}:${MENTOR}`,
        type: "session_request.created",
        actorId: MENTEE,
        targetId: REQUEST,
        recipientId: MENTOR,
      })
    ).rejects.toBeInstanceOf(MalformedJobError);
  });
});

describe("processNotificationMessage — consumer decisions", () => {
  const baseJob = () => ({
    jobId: `notif:request.created:${REQUEST}:${MENTOR}`,
    type: "session_request.created",
    actorId: MENTEE,
    targetId: REQUEST,
    recipientId: MENTOR,
  });
  const raw = (job: any) => Buffer.from(JSON.stringify(job));

  it("acks on success with counts", async () => {
    const result = await processNotificationMessage(raw(baseJob()), {});
    expect(result.decision).toBe("ack");
    expect(result.created).toBe(1);
  });

  it("retries (attempts+1) on a transient failure", async () => {
    h.state.failCreate = true;
    const result = await processNotificationMessage(raw(baseJob()), {});
    expect(result.decision).toBe("retry");
    expect(result.nextAttempts).toBe(1);
    expect(h.state.notifications).toHaveLength(0);
  });

  it("dead-letters once the retry budget is exhausted", async () => {
    h.state.failCreate = true;
    const result = await processNotificationMessage(raw(baseJob()), {
      attempts: MAX_ATTEMPTS,
    });
    expect(result.decision).toBe("dlq");
    expect(h.state.notifications).toHaveLength(0);
  });

  it("retries until MAX_ATTEMPTS then dead-letters", async () => {
    h.state.failCreate = true;
    const r1 = await processNotificationMessage(raw(baseJob()), { attempts: 0 });
    const r2 = await processNotificationMessage(raw(baseJob()), { attempts: 1 });
    const r3 = await processNotificationMessage(raw(baseJob()), { attempts: 2 });
    const r4 = await processNotificationMessage(raw(baseJob()), { attempts: 3 });
    expect(r1.decision).toBe("retry");
    expect(r2.decision).toBe("retry");
    expect(r3.decision).toBe("retry");
    expect(r3.nextAttempts).toBe(MAX_ATTEMPTS);
    expect(r4.decision).toBe("dlq");
  });

  it("dead-letters unparseable payloads without consuming retries", async () => {
    const result = await processNotificationMessage(Buffer.from("{not json"), {});
    expect(result.decision).toBe("dlq");
  });

  it("dead-letters malformed jobs (permanent) instead of retrying", async () => {
    const result = await processNotificationMessage(
      raw({ jobId: "x", type: "mystery.type", actorId: MENTEE, targetId: REQUEST }),
      {}
    );
    expect(result.decision).toBe("dlq");
  });

  it("redelivered (duplicate) message acks without a second insert", async () => {
    const first = await processNotificationMessage(raw(baseJob()), {});
    const second = await processNotificationMessage(raw(baseJob()), {});
    expect(first).toMatchObject({ decision: "ack", created: 1 });
    expect(second).toMatchObject({ decision: "ack", created: 0, skipped: 1 });
    expect(h.state.notifications).toHaveLength(1);
  });
});

describe("dispatchNotification — publish with direct-write fallback", () => {
  const job = () => ({
    jobId: `notif:request.created:${REQUEST}:${MENTOR}`,
    type: "session_request.created",
    actorId: MENTEE,
    targetId: REQUEST,
    recipientId: MENTOR,
  });

  it("publishes to the broker without touching the DB (worker's job)", async () => {
    await dispatchNotification(job());
    expect(memoryBroker.published).toHaveLength(1);
    expect(memoryBroker.published[0].queue).toBe("mentorher.notifications");
    expect(h.state.notifications).toHaveLength(0);
  });

  it("writes directly to the DB when the broker is down — notification not lost", async () => {
    memoryBroker.failConnect = true;
    await dispatchNotification(job());
    expect(memoryBroker.published).toHaveLength(0);
    expect(h.state.notifications).toHaveLength(1);
    expect(h.state.notifications[0].userId).toBe(MENTOR);
  });

  it("never throws even when broker AND database are down", async () => {
    memoryBroker.failConnect = true;
    h.state.failCreate = true;
    await expect(dispatchNotification(job())).resolves.toBeUndefined();
    expect(h.state.notifications).toHaveLength(0);
  });

  it("fallback with an already-delivered job is deduped, not duplicated", async () => {
    // Worker delivered it first...
    await handleNotificationJob(job());
    // ...then the broker dies and the API route's fallback runs again.
    memoryBroker.failConnect = true;
    await dispatchNotification(job());
    expect(h.state.notifications).toHaveLength(1);
  });
});
