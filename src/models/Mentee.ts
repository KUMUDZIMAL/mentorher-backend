import mongoose, { Document, Schema } from "mongoose";

export interface IMentee extends Document {
  userId: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  phone?: string;
  profilePhoto?: string;
  currentStatus: string;
  education: string;
  fieldOfStudy?: string;
  careerGoals: string;
  technicalBackground: string;
  technicalSkills?: string[];
  mentorshipGoals: string;
  preferredMentorshipAreas?: string[];
  linkedinUrl?: string;
  personalBio: string;
  challenges?: string;
  languages?: string[];
  termsAgreed: boolean;
}

const MenteeSchema: Schema = new Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    profilePhoto: { type: String },
    currentStatus: { type: String, required: true },
    education: { type: String, required: true },
    fieldOfStudy: { type: String },
    careerGoals: { type: String, required: true },
    technicalBackground: { type: String, required: true },
    technicalSkills: { type: [String] },
    mentorshipGoals: { type: String, required: true },
    preferredMentorshipAreas: { type: [String] },
    linkedinUrl: { type: String },
    personalBio: { type: String, required: true },
    challenges: { type: String },
    languages: { type: [String] },
    termsAgreed: { type: Boolean, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Mentee || mongoose.model<IMentee>("Mentee", MenteeSchema);
