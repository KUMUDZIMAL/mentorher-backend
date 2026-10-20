import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import Post from "@/models/Post";
import User from "@/models/User";

/**
 * PATCH /api/posts/[id]
 * body: { action: "like" }            -> toggles the like
 * body: { action: "comment", content } -> adds a comment
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, error: "Invalid post id" }, { status: 400 });
  }

  try {
    await dbConnect();
    const { action, content } = await req.json();

    const post = await Post.findById(id);
    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    if (action === "like") {
      const alreadyLiked = (post.likes ?? []).some((likeId: any) => String(likeId) === userId);
      if (alreadyLiked) {
        post.likes = (post.likes ?? []).filter((likeId: any) => String(likeId) !== userId);
      } else {
        post.likes = [...(post.likes ?? []), new mongoose.Types.ObjectId(userId)];
      }
      await post.save();
      return NextResponse.json({
        success: true,
        likes: post.likes.length,
        likedByMe: !alreadyLiked,
      });
    }

    if (action === "comment") {
      if (!content || typeof content !== "string" || !content.trim()) {
        return NextResponse.json({ success: false, error: "Comment content is required" }, { status: 400 });
      }
      const user = await User.findById(userId).select("username").lean<any>();
      post.comments = [
        ...(post.comments ?? []),
        {
          author: new mongoose.Types.ObjectId(userId),
          authorName: user?.username ?? "Member",
          content: content.trim(),
          createdAt: new Date(),
        },
      ];
      await post.save();
      const saved = post.comments[post.comments.length - 1];
      return NextResponse.json({
        success: true,
        comment: {
          _id: String(saved._id ?? ""),
          author: { userId, name: saved.authorName },
          content: saved.content,
          createdAt: String(saved.createdAt),
        },
        comments: post.comments.length,
      });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in PATCH /api/posts/[id]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
