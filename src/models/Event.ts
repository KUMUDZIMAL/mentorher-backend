import mongoose, { Schema, models, model } from "mongoose";

export interface IEvent extends mongoose.Document {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  image?: string;
  category: string;
  isVirtual: boolean;
  createdBy?: mongoose.Types.ObjectId;
}

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    date: { type: String, required: true },
    time: { type: String, required: true },
    location: { type: String, default: "" },
    image: { type: String },
    category: { type: String, default: "Event" },
    isVirtual: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default models.Event || model<IEvent>("Event", EventSchema);
