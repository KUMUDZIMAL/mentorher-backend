import mongoose from "mongoose";
import User from "@/models/User";
import Mentor2 from "@/models/Mentor2";
import Mentee from "@/models/Mentee";

export interface PersonBrief {
  userId: string;
  fullName: string;
  profilePhoto?: string;
  role?: string;
  company?: string;
  email?: string;
}

/**
 * Resolves a set of user ids into display-ready profile summaries
 * (name, photo, role) by looking at mentor / mentee / user documents.
 */
export async function getPeopleBrief(userIds: Array<string | mongoose.Types.ObjectId>): Promise<Record<string, PersonBrief>> {
  const ids = Array.from(new Set(userIds.map(String))).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const result: Record<string, PersonBrief> = {};
  if (ids.length === 0) return result;

  const [users, mentors, mentees] = await Promise.all([
    User.find({ _id: { $in: ids } }).select("username email").lean(),
    Mentor2.find({ userId: { $in: ids } }).select("userId fullName profilePhoto currentRole company").lean(),
    Mentee.find({ userId: { $in: ids } }).select("userId fullName profilePhoto currentStatus").lean(),
  ]);

  for (const user of users) {
    result[String(user._id)] = {
      userId: String(user._id),
      fullName: user.username,
      email: user.email,
    };
  }
  for (const mentor of mentors) {
    const key = String(mentor.userId);
    result[key] = {
      ...result[key],
      userId: key,
      fullName: mentor.fullName || result[key]?.fullName,
      profilePhoto: mentor.profilePhoto,
      role: mentor.currentRole,
      company: mentor.company,
    };
  }
  for (const mentee of mentees) {
    const key = String(mentee.userId);
    result[key] = {
      ...result[key],
      userId: key,
      fullName: mentee.fullName || result[key]?.fullName,
      profilePhoto: mentee.profilePhoto,
      role: mentee.currentStatus,
    };
  }

  return result;
}
