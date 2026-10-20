import mongoose from "mongoose";
import { getPeopleBrief, PersonBrief } from "@/lib/people";

export interface SerializedRequest {
  _id: string;
  topic: string;
  message?: string;
  date: string;
  time: string;
  status: string;
  durationHours: number;
  createdAt: string;
  mentor: PersonBrief | null;
  mentee: PersonBrief | null;
}

export type RequestDoc = {
  _id: mongoose.Types.ObjectId;
  mentorUserId: mongoose.Types.ObjectId | string;
  menteeUserId: mongoose.Types.ObjectId | string;
  topic: string;
  message?: string;
  date: string;
  time: string;
  status: string;
  durationHours: number;
  createdAt: Date | string;
};

/**
 * Serializes raw session request documents and attaches the real
 * counterpart profiles (name, photo, role).
 */
export async function serializeRequests(docs: RequestDoc[]): Promise<SerializedRequest[]> {
  const peopleIds: string[] = [];
  docs.forEach((doc) => {
    peopleIds.push(String(doc.mentorUserId), String(doc.menteeUserId));
  });
  const people = await getPeopleBrief(peopleIds);

  return docs.map((doc) => ({
    _id: String(doc._id),
    topic: doc.topic,
    message: doc.message,
    date: doc.date,
    time: doc.time,
    status: doc.status,
    durationHours: doc.durationHours ?? 1,
    createdAt: String(doc.createdAt),
    mentor: people[String(doc.mentorUserId)] ?? null,
    mentee: people[String(doc.menteeUserId)] ?? null,
  }));
}

/** Splits a date string ("YYYY-MM-DD" or free text) into a Date when possible. */
export function parseSessionDate(date: string): Date | null {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
