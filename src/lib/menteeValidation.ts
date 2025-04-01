import { z } from "zod";

export const menteeFormSchema = z.object({
  // Personal Information
  fullName: z.string().nonempty("Full Name is required"),
  email: z.string().nonempty("Email is required").email("Please enter a valid email address"),
  phone: z.string().nonempty("Phone number is required"),
  profilePhoto: z.any(), // Adjust validation as needed for your image type

  // Background & Goals
  currentStatus: z.enum(["student", "employed", "career_transition", "unemployed"], {
    errorMap: () => ({ message: "Please select your current status" }),
  }),
  education: z.string().nonempty("Education is required"),
  fieldOfStudy: z.string().nonempty("Field of Study is required"),
  careerGoals: z.string().nonempty("Career goals are required"),

  // Technical Background
  technicalBackground: z.string().nonempty("Technical background is required"),
  technicalSkills: z.array(z.string()).min(1, "At least one technical skill is required"),

  // Mentorship Preferences
  mentorshipGoals: z.string().nonempty("Mentorship goals are required"),
  preferredMentorshipAreas: z.array(z.string()).min(1, "At least one mentorship area is required"),
  availability: z
    .array(
      z.object({
        day: z.string().nonempty("Day is required"),
        startTime: z.string().nonempty("Start time is required"),
        endTime: z.string().nonempty("End time is required"),
      })
    )
    .min(1, "At least one availability slot is required"),

  // Additional Information
  linkedinUrl: z
    .string()
    .nonempty("LinkedIn URL is required")
    .url("Please enter a valid LinkedIn URL"),
  personalBio: z.string().nonempty("Personal bio is required"),
  challenges: z.string().nonempty("Challenges are required"),
  languages: z.array(z.string()).min(1, "At least one language is required"),

  // Terms
  termsAgreed: z.boolean().refine(val => val === true, {
    message: "You must agree to the Terms and Conditions",
  }),
});

export type MenteeFormValues = z.infer<typeof menteeFormSchema>;

export const defaultMenteeFormValues: MenteeFormValues = {
  fullName: "",
  email: "",
  phone: "",
  profilePhoto: "",
  currentStatus: "student", // Must be one of the enum values.
  education: "",
  fieldOfStudy: "",
  careerGoals: "",
  technicalBackground: "",
  technicalSkills: [],
  mentorshipGoals: "",
  preferredMentorshipAreas: [],
  availability: [
    {
      day: "",
      startTime: "",
      endTime: "",
    },
  ],
  linkedinUrl: "",
  personalBio: "",
  challenges: "",
  languages: [],
  termsAgreed: false, // Default is false, user must check to pass validation.
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
