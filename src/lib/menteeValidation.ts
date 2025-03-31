import { z } from "zod";

export const menteeFormSchema = z.object({
  // Personal Information
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  profilePhoto: z.any().optional(),
  
  // Background & Goals
  currentStatus: z.enum(["student", "employed", "career_transition", "unemployed"], {
    errorMap: () => ({ message: "Please select your current status" }),
  }).optional(),
  education: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  careerGoals: z.string().optional(),
  
  // Technical Background
  technicalBackground: z.string().optional(),
  technicalSkills: z.array(z.string()).optional(),
  
  // Mentorship Preferences
  mentorshipGoals: z.string().optional(),
  preferredMentorshipAreas: z.array(z.string()).optional(),
  availability: z.array(z.object({
    day: z.string(),
    startTime: z.string(),
    endTime: z.string(),
  })).optional(),
  
  // Additional Information
  linkedinUrl: z.string().url("Please enter a valid LinkedIn URL").optional().or(z.literal("")),
  personalBio: z.string().optional(),
  challenges: z.string().optional(),
  languages: z.array(z.string()).optional(),
  
  // Terms
  termsAgreed: z.boolean().optional(),
});

export type MenteeFormValues = z.infer<typeof menteeFormSchema>;

export const defaultMenteeFormValues: Partial<MenteeFormValues> = {
  fullName: "",
  email: "",
  phone: "",
  currentStatus: "student",
  education: "",
  fieldOfStudy: "",
  careerGoals: "",
  technicalBackground: "",
  technicalSkills: [],
  mentorshipGoals: "",
  preferredMentorshipAreas: [],
  availability: [],
  linkedinUrl: "",
  personalBio: "",
  challenges: "",
  languages: [],
};

export const mentorshipAreaOptions = [
  "Career Guidance",
  "Technical Skill Development",
  "Interview Preparation",
  "Resume & Portfolio Review",
  "Industry Connections",
  "Work-Life Balance",
  "Leadership Skills",
  "Public Speaking",
  "Networking",
  "Startup Advice",
  "Remote Work",
  "Freelancing",
];

export const currentStatusOptions = [
  { value: "student", label: "Student" },
  { value: "employed", label: "Employed in Tech" },
  { value: "career_transition", label: "Transitioning to Tech" },
  { value: "unemployed", label: "Looking for Opportunities" },
];

// Reuse these from mentor form validation
export { 
  technicalSkillOptions, 
  languageOptions 
} from "./validation";