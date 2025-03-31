
import { z } from "zod";

export const mentorFormSchema = z.object({
  // Personal Information
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  profilePhoto: z.any().optional(),
  
  // Professional Background
  currentRole: z.string().min(1, "Current role is required"),
  company: z.string().min(1, "Company name is required"),
  yearsOfExperience: z.coerce.number().optional(),
  education: z.string().optional(),
  careerHistory: z.string().optional(),
  
  // Areas of Expertise & Skills
  technicalSkills: z.array(z.string()).min(1, "Select at least one technical skill"),
  industrySpecialization: z.string().optional(),
  softSkills: z.array(z.string()).optional(),
  
  // Mentorship Specifics
  mentoringGoals: z.string().optional(),
  mentoringStyle: z.enum(["structured", "informal", "hybrid"], {
    errorMap: () => ({ message: "Please select a mentoring style" }),
  }),
  availability: z.array(z.object({
    day: z.string(),
    startTime: z.string(),
    endTime: z.string(),
   
  })).min(1, "Please select at least one availability slot"),
  mentorshipExperience: z.string().optional(),
  
  // Online Presence & Additional Resources
  linkedinUrl: z.string().url("Please enter a valid LinkedIn URL").or(z.literal("")).optional(),
  personalBio: z.string().optional(),
  achievements: z.string().optional(),
  languages: z.array(z.string()).optional(),
  
  // Optional Enhancements
  areasOfInterest: z.array(z.string()).optional(),
  testimonials: z.string().optional(),
  
  // Terms
  termsAgreed: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms and conditions" }),
  }),
});

export type MentorFormValues = z.infer<typeof mentorFormSchema>;

export const defaultMentorFormValues: Partial<MentorFormValues> = {
  fullName: "",
  email: "",
  phone: "",
  currentRole: "",
  company: "",
  yearsOfExperience: 0,
  education: "",
  careerHistory: "",
  technicalSkills: [],
  industrySpecialization: "",
  softSkills: [],
  mentoringGoals: "",
  mentoringStyle: "structured",
  availability: [],
  mentorshipExperience: "",
  linkedinUrl: "",
  personalBio: "",
  achievements: "",
  languages: [],
  areasOfInterest: [],
  testimonials: "",
};

export const technicalSkillOptions = [
  "Frontend Development",
  "Backend Development",
  "Full-Stack Development",
  "Mobile Development",
  "DevOps",
  "Cloud Computing",
  "Data Science",
  "Machine Learning",
  "Artificial Intelligence",
  "UX/UI Design",
  "Product Management",
  "QA & Testing",
  "Cybersecurity",
  "Blockchain",
  "Database Administration",
  "Project Management",
  "Software Architecture",
];

export const softSkillOptions = [
  "Leadership",
  "Communication",
  "Problem Solving",
  "Teamwork",
  "Time Management",
  "Critical Thinking",
  "Adaptability",
  "Emotional Intelligence",
  "Conflict Resolution",
  "Networking",
  "Public Speaking",
  "Negotiation",
  "Decision Making",
  "Creativity",
  "Mentoring",
];

export const industryOptions = [
  "Finance/Fintech",
  "Healthcare/Medtech",
  "E-commerce/Retail",
  "Education/Edtech",
  "Entertainment/Media",
  "Social Media",
  "Gaming",
  "Travel/Hospitality",
  "Transportation/Logistics",
  "Real Estate/Proptech",
  "Energy/Cleantech",
  "Agriculture/Agritech",
  "Government/Public Sector",
  "Nonprofits/Social Impact",
  "Telecommunications",
  "Manufacturing",
  "Consulting",
];

export const languageOptions = [
  "English",
  "Spanish",
  "French",
  "German",
  "Chinese (Mandarin)",
  "Hindi",
  "Arabic",
  "Portuguese",
  "Russian",
  "Japanese",
  "Korean",
  "Italian",
];

export const areasOfInterestOptions = [
  "Career Advancement",
  "Technical Skill Development",
  "Leadership Development",
  "Work-Life Balance",
  "Navigating Workplace Dynamics",
  "Entrepreneurship",
  "Public Speaking",
  "Networking",
  "Remote Work",
  "International Opportunities",
  "Personal Branding",
];
