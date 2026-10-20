import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memoryBroker } from "./memory-amqp";

vi.mock("amqplib", () => ({
  default: {
    connect: (url?: string) => memoryBroker.connect(url),
  },
}));

import {
  publishNotification,
  closeQueue,
  QUEUE_WORK,
  QUEUE_RETRY,
  QUEUE_DLQ,
} from "../queue";

const JOB = {
  jobId: "notif:request.created:655f0000000000000000000a:655f0000000000000000000b",
  type: "session_request.created",
  actorId: "655f0000000000000000000b",
  targetId: "655f0000000000000000000a",
  recipientId: "655f0000000000000000000c",
};

function enableQueue() {
  process.env.RABBITMQ_URL = "amqp://guest:guest@127.0.0.1:5672";
  process.env.RABBITMQ_ENABLED = "true";
}

beforeEach(async () => {
  await closeQueue();
  memoryBroker.reset();
  enableQueue();
});

afterEach(async () => {
  await closeQueue();
  delete process.env.RABBITMQ_URL;
  delete process.env.RABBITMQ_ENABLED;
});

describe("publishNotification", () => {
  it("publishes a persistent message to the work queue and returns true", async () => {
    const ok = await publishNotification(JOB);
    expect(ok).toBe(true);
    expect(memoryBroker.published).toHaveLength(1);
    const msg = memoryBroker.published[0];
    expect(msg.queue).toBe(QUEUE_WORK);
    expect(msg.options.persistent).toBe(true);
    expect(msg.options.messageId).toBe(JOB.jobId);
    expect(msg.options.contentType).toBe("application/json");
  });

  it("payload contains ids and type only — no PII fields", async () => {
    await publishNotification(JOB);
    const payload = memoryBroker.parse();
    expect(Object.keys(payload).sort()).toEqual(
      ["actorId", "jobId", "recipientId", "targetId", "type"].sort()
    );
    // Every value is an id or a type discriminator — no content, names, tokens.
    for (const value of Object.values(payload)) {
      expect(typeof value).toBe("string");
    }
    const raw = memoryBroker.published[0].content.toString("utf8");
    expect(raw).not.toMatch(/password|token|email|content/i);
  });

  it("asserts the durable topology (work/retry/dlq with dead-letter args)", async () => {
    await publishNotification(JOB);
    const work = memoryBroker.queues.get(QUEUE_WORK)!;
    const retry = memoryBroker.queues.get(QUEUE_RETRY)!;
    const dlq = memoryBroker.queues.get(QUEUE_DLQ)!;
    expect(work.args).toMatchObject({
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUE_DLQ,
      },
    });
    expect(retry.args).toMatchObject({
      durable: true,
      arguments: {
        "x-message-ttl": 5000,
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUE_WORK,
      },
    });
    expect(dlq.args).toMatchObject({ durable: true });
  });

  it("returns false without throwing when the broker is unreachable", async () => {
    memoryBroker.failConnect = true;
    await expect(publishNotification(JOB)).resolves.toBe(false);
    expect(memoryBroker.published).toHaveLength(0);
  });

  it("returns false without throwing when the publish itself fails", async () => {
    memoryBroker.failPublish = true;
    await expect(publishNotification(JOB)).resolves.toBe(false);
  });

  it("returns false without throwing when confirmation is not received", async () => {
    memoryBroker.failConfirms = true;
    await expect(publishNotification(JOB)).resolves.toBe(false);
  });

  it("recovers after a failure once the connection is re-established", async () => {
    memoryBroker.failConnect = true;
    expect(await publishNotification(JOB)).toBe(false);

    // Recovery: broker is back (closeQueue also clears the reconnect backoff).
    memoryBroker.failConnect = false;
    await closeQueue();
    expect(await publishNotification(JOB)).toBe(true);
    expect(memoryBroker.published).toHaveLength(1);
  });

  it("is a no-op when RABBITMQ_ENABLED=false (no connection attempt)", async () => {
    process.env.RABBITMQ_ENABLED = "false";
    expect(await publishNotification(JOB)).toBe(false);
    expect(memoryBroker.connections).toBe(0);
  });

  it("is a no-op when RABBITMQ_URL is unset", async () => {
    delete process.env.RABBITMQ_URL;
    expect(await publishNotification(JOB)).toBe(false);
    expect(memoryBroker.connections).toBe(0);
  });
});
