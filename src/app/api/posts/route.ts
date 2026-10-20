import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import Post from "@/models/Post";
import User from "@/models/User";
import Mentor2 from "@/models/Mentor2";
import Mentee from "@/models/Mentee";

export const dynamic = "force-dynamic";

async function resolveAuthorRole(userId: string, fallback: string): Promise<string> {
  const [mentor, mentee] = await Promise.all([
    Mentor2.findOne({ userId }).select("currentRole").lean<any>(),
    Mentee.findOne({ userId }).select("currentStatus").lean<any>(),
  ]);
  if (mentor?.currentRole) return mentor.currentRole;
  if (mentee?.currentStatus) return mentee.currentStatus;
  return fallback;
}

/** GET /api/posts — forum discussions from MongoDB. */
export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);

  try {
    await dbConnect();
    const posts = await Post.find({}).sort({ createdAt: -1 }).limit(50).lean<any[]>();

    // Legacy posts may not store authorName — resolve usernames from Users.
    const authorIds = new Set<string>();
    posts.forEach((post: any) => {
      if (post.author) authorIds.add(String(post.author));
      (post.comments ?? []).forEach((c: any) => {
        if (c.author) authorIds.add(String(c.author));
      });
    });
    const users = authorIds.size
      ? await User.find({ _id: { $in: [...authorIds] } }).select("username").lean<any[]>()
      : [];
    const nameById: Record<string, string> = {};
    users.forEach((u: any) => {
      nameById[String(u._id)] = u.username;
    });
    const nameFor = (id: unknown, stored?: string): string =>
      stored || (id ? nameById[String(id)] : undefined) || "Member";

    return NextResponse.json({
      success: true,
      posts: posts.map((post: any) => ({
        _id: String(post._id),
        author: {
          userId: String(post.author),
          name: nameFor(post.author, post.authorName),
          role: post.authorRole || "",
        },
        title: post.title ?? "",
        content: post.content ?? "",
        tags: post.tags ?? [],
        likes: (post.likes ?? []).length,
        likedByMe: userId ? (post.likes ?? []).some((id: any) => String(id) === userId) : false,
        comments: (post.comments ?? []).map((c: any) => ({
          _id: String(c._id ?? ""),
          author: { userId: String(c.author), name: nameFor(c.author, c.authorName) },
          content: c.content ?? "",
          createdAt: String(c.createdAt),
        })),
        createdAt: String(post.createdAt),
      })),
    });
  } catch (error: any) {
    console.error("Error in GET /api/posts:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** POST /api/posts — create a discussion. */
export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const { title, content, tags } = await req.json();

    if (!title || !content) {
      return NextResponse.json({ success: false, error: "Title and content are required" }, { status: 400 });
    }

    const user = await User.findById(userId).select("username").lean<any>();
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const authorRole = await resolveAuthorRole(userId, "Community Member");

    const post = await Post.create({
      author: userId,
      authorName: user.username,
      authorRole,
      title,
      content,
      tags: Array.isArray(tags) ? tags : [],
    });

    return NextResponse.json({
      success: true,
      post: {
        _id: String(post._id),
        author: { userId, name: post.authorName, role: post.authorRole },
        title: post.title,
        content: post.content,
        tags: post.tags,
        likes: 0,
        likedByMe: false,
        comments: [],
        createdAt: String(post.createdAt),
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/posts:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
