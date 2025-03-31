// /api/messages/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { dbConnect } from '@/lib/mongodb';
import Message from '@/models/Message';
import Group from '@/models/Group';
import mongoose from 'mongoose';
import UserProfileModel from '@/models/userProfile';

export async function GET(req: NextRequest) {
  await dbConnect();

  // Retrieve token from cookies
  const token = req.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'No token found' }, { status: 401 });
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (!decoded || !decoded.id) {
    return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
  }

  const currentUserId = decoded.id;
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('groupId');
  const receiverId = searchParams.get('receiverId');

  // Group messaging flow
  if (groupId) {
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: 'Invalid group ID format' }, { status: 400 });
    }

    // Check if current user is a participant in the group
    const group = await Group.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!group.participants.map(String).includes(currentUserId)) {
      return NextResponse.json({ error: 'You are not a participant of this group' }, { status: 403 });
    }

    // Fetch group messages
    const messages = await Message.find({ group: groupId })
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json({ messages }, { status: 200 });
  }

  // Direct messaging flow
  if (receiverId) {
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return NextResponse.json({ error: 'Invalid receiver ID format' }, { status: 400 });
    }

    // Check follow relationship: allow messaging if current user follows receiver OR receiver follows current user
    const currentUserProfile = await UserProfileModel.findOne({ userId: currentUserId });
    const receiverProfile = await UserProfileModel.findOne({ userId: receiverId });

    const canMessage =
      currentUserProfile?.following?.includes(receiverId) ||
      receiverProfile?.following?.includes(currentUserId);

    if (!canMessage) {
      return NextResponse.json({ error: 'You are not allowed to message this user' }, { status: 403 });
    }

    // Fetch messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: receiverId },
        { sender: receiverId, receiver: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json({ messages }, { status: 200 });
  }

  return NextResponse.json(
    { error: 'Missing receiverId or groupId query parameter' },
    { status: 400 }
  );
}

export async function POST(req: NextRequest) {
  await dbConnect();

  // Retrieve token from cookies
  const token = req.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'No token found' }, { status: 401 });
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (!decoded || !decoded.id) {
    return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
  }

  const currentUserId = decoded.id;
  const { receiverId, groupId, content } = await req.json();

  // Validate message content
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
  }

  // If sending a group message
  if (groupId) {
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: 'Invalid group ID format' }, { status: 400 });
    }
    // Check if current user is a participant in the group
    const group = await Group.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!group.participants.map(String).includes(currentUserId)) {
      return NextResponse.json({ error: 'You are not a participant of this group' }, { status: 403 });
    }

    try {
      const newMessage = await Message.create({
        sender: currentUserId,
        group: groupId,
        content,
      });
      return NextResponse.json({ message: "Message sent", newMessage }, { status: 201 });
    } catch (err) {
      console.error('Error creating group message:', err);
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
    }
  }

  // If sending a direct message
  if (receiverId) {
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return NextResponse.json({ error: 'Invalid receiver ID format' }, { status: 400 });
    }

    // Check follow relationship as in GET endpoint
    const currentUserProfile = await UserProfileModel.findOne({ userId: currentUserId });
    const receiverProfile = await UserProfileModel.findOne({ userId: receiverId });

    const canMessage =
      currentUserProfile?.following?.includes(receiverId) ||
      receiverProfile?.following?.includes(currentUserId);

    if (!canMessage) {
      return NextResponse.json({ error: 'You are not allowed to message this user' }, { status: 403 });
    }

    try {
      const newMessage = await Message.create({
        sender: currentUserId,
        receiver: receiverId,
        content,
      });
      return NextResponse.json({ message: "Message sent", newMessage }, { status: 201 });
    } catch (err) {
      console.error('Error creating direct message:', err);
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: 'Missing receiverId or groupId in request body' },
    { status: 400 }
  );
}
