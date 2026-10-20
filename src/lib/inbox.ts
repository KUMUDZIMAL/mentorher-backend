import mongoose from "mongoose";
import Message from "@/models/Message";
import { getPeopleBrief, PersonBrief } from "@/lib/people";

export interface InboxMessage {
  _id: string;
  content: string;
  read: boolean;
  createdAt: string;
  from: PersonBrief | null;
}

/**
 * Returns the most recent direct messages received by `userId`,
 * with the real sender profile attached, plus the unread count.
 */
export async function getInbox(userId: string, limit = 10): Promise<{ recent: InboxMessage[]; unreadCount: number }> {
  const [messages, unreadCount] = await Promise.all([
    Message.find({ receiver: userId, group: null })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Message.countDocuments({ receiver: userId, group: null, read: false }),
  ]);

  const senders = await getPeopleBrief(messages.map((m) => String(m.sender)));

  return {
    recent: messages.map((m) => ({
      _id: String(m._id),
      content: m.content,
      read: Boolean(m.read),
      createdAt: String(m.createdAt),
      from: senders[String(m.sender)] ?? null,
    })),
    unreadCount,
  };
}

/** Marks every direct message sent to `userId` as read. */
export async function markInboxRead(userId: string): Promise<number> {
  const result = await Message.updateMany(
    { receiver: userId, group: null, read: false },
    { $set: { read: true } }
  );
  return result.modifiedCount ?? 0;
}

export function isValidId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}
