/**
 * In-memory RabbitMQ stand-in for `vi.mock("amqplib")`.
 * Mirrors the small slice of the amqplib API that src/lib/queue.ts uses:
 * connect -> createConfirmChannel -> assertQueue / sendToQueue / waitForConfirms.
 */

export interface PublishedMessage {
  queue: string;
  content: Buffer;
  options: {
    persistent?: boolean;
    messageId?: string;
    contentType?: string;
    timestamp?: number;
    headers?: Record<string, unknown>;
  };
}

export interface MemoryQueue {
  name: string;
  args?: Record<string, unknown>;
  messages: PublishedMessage[];
}

export class MemoryBroker {
  queues = new Map<string, MemoryQueue>();
  published: PublishedMessage[] = [];
  connections = 0;
  /** When true, connect() rejects (broker down). */
  failConnect = false;
  /** When true, sendToQueue() throws (channel died mid-publish). */
  failPublish = false;
  /** When true, waitForConfirms() rejects (publish not confirmed). */
  failConfirms = false;

  connect = async (_url?: string): Promise<any> => {
    if (this.failConnect) throw new Error("connect ECONNREFUSED 127.0.0.1:5672");
    this.connections += 1;
    const broker = this;
    return {
      on(): any {
        return this;
      },
      async createConfirmChannel(): Promise<any> {
        return {
          async assertQueue(name: string, args?: Record<string, unknown>): Promise<any> {
            if (!broker.queues.has(name)) broker.queues.set(name, { name, args, messages: [] });
            return { queue: name, messageCount: broker.queues.get(name)!.messages.length };
          },
          sendToQueue(queue: string, content: Buffer, options: PublishedMessage["options"]): boolean {
            if (broker.failPublish) throw new Error("Channel closed by broker");
            const entry: PublishedMessage = { queue, content, options };
            broker.published.push(entry);
            const q = broker.queues.get(queue);
            if (q) q.messages.push(entry);
            return true;
          },
          async waitForConfirms(): Promise<void> {
            if (broker.failConfirms) throw new Error("confirm timed out");
          },
          async close(): Promise<void> {
            /* no-op */
          },
        };
      },
      async close(): Promise<void> {
        /* no-op */
      },
    };
  };

  reset(): void {
    this.queues.clear();
    this.published = [];
    this.connections = 0;
    this.failConnect = false;
    this.failPublish = false;
    this.failConfirms = false;
  }

  /** Parse a published message back into a plain object. */
  parse(index = 0): any {
    return JSON.parse(this.published[index].content.toString("utf8"));
  }
}

/** Module-level singleton so the vi.mock factory and tests share one broker. */
export const memoryBroker = new MemoryBroker();
