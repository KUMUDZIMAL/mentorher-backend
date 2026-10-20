import mongoose, { Schema, models, model } from "mongoose";

export interface IPostComment {
  author: mongoose.Types.ObjectId;
  authorName: string;
  content: string;
  createdAt: Date;
}

export interface IPost extends mongoose.Document {
  author: mongoose.Types.ObjectId;
  authorName: string;
  authorRole: string;
  title: string;
  content: string;
  tags: string[];
  likes: mongoose.Types.ObjectId[];
  comments: IPostComment[];
}

const PostSchema = new Schema<IPost>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, default: "Community Member" },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    likes: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    comments: [
      {
        author: { type: Schema.Types.ObjectId, ref: "User", required: true },
        authorName: { type: String, required: true },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default models.Post || model<IPost>("Post", PostSchema);
