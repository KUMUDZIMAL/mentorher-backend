import mongoose, { Schema, models, model } from "mongoose";

export type SessionRequestStatus = "pending" | "accepted" | "declined" | "completed";

export interface ISessionRequest extends mongoose.Document {
  mentorUserId: mongoose.Types.ObjectId;
  menteeUserId: mongoose.Types.ObjectId;
  topic: string;
  message?: string;
  date: string;
  time: string;
  status: SessionRequestStatus;
  durationHours: number;
}

const SessionRequestSchema = new Schema<ISessionRequest>(
  {
    mentorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    menteeUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topic: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "completed"],
      default: "pending",
    },
    durationHours: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true }
);

export default models.SessionRequest || model<ISessionRequest>("SessionRequest", SessionRequestSchema);
