import {
  handleNotificationJob,
  MalformedJobError,
  type NotificationJob,
} from "./notifications";

/**
 * Consumer decision core — pure logic for one queue message, independent of
 * amqplib so it is unit-testable. The worker (worker/notification-worker.ts)
 * only performs the ack / retry-republish / dead-letter plumbing based on the
 * returned decision.
 *
 * Policies:
 * - Unparseable payload            -> "dlq"  (retries can never fix it)
 * - Attempts exhausted (>= MAX)    -> "dlq"  (no infinite retry loops)
 * - Malformed job (permanent)      -> "dlq"
 * - Transient failure (Mongo etc.) -> "retry" with attempts+1 (delayed via the retry queue)
 * - Success / duplicate delivered  -> "ack"
 */

export const MAX_ATTEMPTS = 3;

export type ConsumeDecision = "ack" | "retry" | "dlq";

export interface ConsumeResult {
  decision: ConsumeDecision;
  /** Attempt number this processing round represents (0-based). */
  attempts: number;
  /** Next attempt number to stamp on the message when retrying. */
  nextAttempts?: number;
  created?: number;
  skipped?: number;
}

export async function processNotificationMessage(
  raw: unknown,
  headers: Record<string, unknown> | undefined | null
): Promise<ConsumeResult> {
  const attempts = Number(headers?.attempts ?? 0) || 0;

  // 1. Malformed payload -> dead-letter immediately, never burn retries.
  let job: NotificationJob;
  try {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    job = parsed as NotificationJob;
  } catch {
    return { decision: "dlq", attempts };
  }

  // 2. Retry budget exhausted -> dead-letter (no infinite loops).
  if (attempts >= MAX_ATTEMPTS) {
    return { decision: "dlq", attempts };
  }

  try {
    const outcome = await handleNotificationJob(job);
    return { decision: "ack", attempts, created: outcome.created, skipped: outcome.skipped };
  } catch (err) {
    if (err instanceof MalformedJobError) {
      return { decision: "dlq", attempts };
    }
    // Transient failure -> schedule a delayed retry, or dead-letter if the
    // budget is already spent (attempts just hit the ceiling).
    const nextAttempts = attempts + 1;
    if (nextAttempts > MAX_ATTEMPTS) {
      return { decision: "dlq", attempts };
    }
    return { decision: "retry", attempts, nextAttempts };
  }
}
