import mongoose, { Schema, model, models } from "mongoose";
import { boolean } from "zod";

const MentorSchema = new Schema(
  {
    // Reference to the User document
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    profilePhoto: { type: String },
    currentRole: { type: String },
    company: { type: String },
    yearsOfExperience: { type: Number },
    education: { type: String },
    technicalSkills: { type: [String], default: [] },
    industrySpecialization: { type: String },
    softSkills: { type: [String], default: [] },
    mentoringGoals: { type: String },
    mentoringStyle: { type: String },
    availability: [
      {
        day: { type: String },
        startTime: { type: String },
        endTime: { type: String },
 
      },
    ],
    mentorshipExperience: { type: String },
    linkedinUrl: { type: String },
    personalBio: { type: String },
    achievements: { type: String },
    languages: { type: [String], default: [] },
    areasOfInterest: { type: [String], default: [] },
    // New field for work experience
    experience: [
      {
        role: { type: String, required: true },
        company: { type: String, required: true },
        duration: { type: String, required: true }, // e.g., "Jan 2020 - Present"
        description: { type: String },
        current: { type: Boolean, default: false },
      },
    ],
    termsAgreed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Prevent model recompilation during hot reloads
const Mentor2 = models.Mentor2 || model("Mentor2", MentorSchema);
export default Mentor2;
