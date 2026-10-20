/**
 * MentorHer notification worker — consumes RabbitMQ jobs and writes in-app
 * notifications. Runs as a separate process from the Next.js API:
 *
 *   npm run worker   (= node --import tsx --env-file=.env.local worker/notification-worker.ts)
 *
 * Lifecycle:
 * - Connects to MongoDB, then to RabbitMQ with exponential backoff
 *   (5s -> 30s) on connection loss; logs and keeps retrying.
 * - prefetch(1): one in-flight message at a time.
 * - Settles each message via processNotificationMessage():
 *     ack   -> done
 *     retry -> republish to the retry queue with attempts+1 (5s TTL delay)
 *     dlq   -> nack without requeue -> dead-letter queue (terminal)
 * - SIGINT/SIGTERM -> cancel consumer, close channel + connection,
 *   disconnect MongoDB, exit 0 (force-exit safety timer after 10s).
 *
 * Logs carry only jobIds/types/counts — never message content or credentials.
 */
import amqp from "amqplib";
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from "amqplib";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/mongodb";
import { processNotificationMessage } from "../src/lib/consumer";
import { QUEUE_WORK, QUEUE_RETRY, QUEUE_DLQ } from "../src/lib/queue";

const BACKOFF_MIN_MS = 5000;
const BACKOFF_MAX_MS = 30000;

let stopping = false;
let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;
let consumerTag: string | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function settleMessage(msg: ConsumeMessage): Promise<void> {
  const ch = channel;
  if (!ch) return;
  const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
  const messageId = typeof msg.properties.messageId === "string" ? msg.properties.messageId : "unknown";

  let result;
  try {
    result = await processNotificationMessage(msg.content, headers);
  } catch (err) {
    // processNotificationMessage is not supposed to throw — leave the message
    // unacked so it is redelivered instead of risking a lost job.
    console.warn("[worker] unexpected processing error:", err instanceof Error ? err.message : err);
    return;
  }

  try {
    if (result.decision === "ack") {
      ch.ack(msg);
      console.info(
        `[worker] ack ${messageId} created=${result.created ?? 0} skipped=${result.skipped ?? 0}`
      );
    } else if (result.decision === "dlq") {
      console.warn(`[worker] dead-letter ${messageId} attempts=${result.attempts}`);
      ch.nack(msg, false, false); // -> DLQ via the queue's dead-letter config
    } else {
      // Delayed retry: publish to the retry queue (TTL) which dead-letters
      // back into the work queue, then ack the original.
      ch.sendToQueue(QUEUE_RETRY, msg.content, {
        persistent: true,
        messageId: msg.properties.messageId,
        contentType: msg.properties.contentType,
        headers: { ...headers, attempts: result.nextAttempts },
      });
      await ch.waitForConfirms();
      ch.ack(msg);
      console.warn(`[worker] retry #${result.nextAttempts} scheduled for ${messageId}`);
    }
  } catch (err) {
    // Settle failed (e.g. channel died mid-flight). Do not ack — the message
    // stays unacked and is redelivered; jobId dedupe absorbs the duplicate.
    console.warn(
      `[worker] failed to settle ${messageId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

async function consumeSession(url: string): Promise<void> {
  const conn = await amqp.connect(url);
  connection = conn;
  conn.on("error", (err) => console.warn("[worker] connection error:", err.message));

  const closed = new Promise<void>((resolve) => conn.on("close", () => resolve()));

  const ch = await conn.createConfirmChannel();
  channel = ch;
  // Same durable topology as the publisher (idempotent asserts).
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
  await ch.prefetch(1);

  const { consumerTag: tag } = await ch.consume(QUEUE_WORK, (msg) => {
    if (msg) void settleMessage(msg);
  });
  consumerTag = tag;
  console.info(`[worker] consuming ${QUEUE_WORK}`);

  await closed; // connection lost or shutdown closed it
  connection = null;
  channel = null;
  consumerTag = null;
  throw new Error("connection closed");
}

async function run(): Promise<void> {
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    console.error("[worker] RABBITMQ_URL is not set — refusing to start.");
    process.exit(1);
  }
  if (process.env.RABBITMQ_ENABLED === "false") {
    console.error("[worker] RABBITMQ_ENABLED=false — refusing to start.");
    process.exit(1);
  }

  await dbConnect();
  console.info("[worker] MongoDB connected");

  let backoff = BACKOFF_MIN_MS;
  while (!stopping) {
    try {
      await consumeSession(url);
      backoff = BACKOFF_MIN_MS;
    } catch (err) {
      if (!stopping) {
        console.warn("[worker] connection lost:", err instanceof Error ? err.message : err);
      }
    }
    if (stopping) break;
    console.warn(`[worker] reconnecting in ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} received — shutting down`);

  // Safety net: never hang on a stuck close.
  const force = setTimeout(() => {
    console.error("[worker] forced exit after shutdown timeout");
    process.exit(1);
  }, 10000);
  force.unref();

  try {
    if (channel && consumerTag) await channel.cancel(consumerTag);
    if (channel) await channel.close();
    if (connection) await connection.close();
    await mongoose.disconnect();
  } catch (err) {
    console.warn("[worker] shutdown error:", err instanceof Error ? err.message : err);
  }
  console.info("[worker] stopped cleanly");
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("[worker] unhandled rejection:", err instanceof Error ? err.message : err);
});

run().catch((err) => {
  console.error("[worker] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
