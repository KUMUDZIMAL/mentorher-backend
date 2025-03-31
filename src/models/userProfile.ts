import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  userId: mongoose.Types.ObjectId;
  profilePicture?: string;
  posts: mongoose.Types.ObjectId[];
  followers: mongoose.Types.ObjectId[];
  following: mongoose.Types.ObjectId[];
  interests: string[];
  professions: string[];
  skills: string[];
  experiences: {
    title: string;
    description: string;
  }[];
  about: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    profilePicture: { type: String, default: "" },
    posts: [{ type: Schema.Types.ObjectId, ref: "Post" }],
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: Schema.Types.ObjectId, ref: "User" }],
    interests: { type: [String], default: [] }, // Ensures interests is always an array
    professions: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    experiences: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],
    about: { type: String, default: "" },
  },
  { timestamps: true }
);

const UserProfileModel =
  mongoose.models.UserProfile || mongoose.model<IUser>("UserProfile", UserSchema);

export default UserProfileModel;
