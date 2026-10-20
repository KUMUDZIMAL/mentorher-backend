import mongoose, { Schema, models, model } from "mongoose";

const CareerPathSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    targetRole: { type: String, required: true },
    input: {
      currentStatus: { type: String, default: "" },
      education: { type: String, default: "" },
      skills: { type: [String], default: [] },
      hoursPerWeek: { type: String, default: "" },
      challenges: { type: String, default: "" },
    },
    summary: { type: String, default: "" },
    skillGaps: { type: [String], default: [] },
    phases: { type: [Schema.Types.Mixed], default: [] },
    roles: { type: [String], default: [] },
    interviewFocus: { type: [String], default: [] },
    events: { type: [Schema.Types.Mixed], default: [] },
    completedPhases: { type: [Number], default: [] },
  },
  { timestamps: true }
);

export default models.CareerPath || model("CareerPath", CareerPathSchema);
