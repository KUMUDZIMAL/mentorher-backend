import mongoose, { Document, Model, Schema } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  type: string;
  targetId: mongoose.Types.ObjectId;
  text: string;
  jobId: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema<INotification> = new Schema(
  {
    // Recipient.
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Who caused the event (used for chat/profile links). Ids only — no PII.
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      required: true,
      enum: ["session_request.created", "session_request.updated", "dm.created", "group_message.created"],
    },
    // The request/message the notification refers to.
    targetId: { type: Schema.Types.ObjectId, required: true },
    // Human-readable text, built by the worker from DB data.
    text: { type: String, required: true },
    // Idempotency key — unique index turns duplicate deliveries into no-ops.
    jobId: { type: String, required: true, unique: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
