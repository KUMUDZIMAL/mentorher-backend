import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { dbConnect } from '@/lib/mongodb';
import Group from '@/models/Group';
import User from '@/models/User';

// POST: Create a new group
export async function POST(req: NextRequest) {
  await dbConnect();
  
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as jwt.JwtPayload;
    const userId = decoded.id;

    const { name, participantUsernames } = await req.json();
    
    // Validate input
    if (!name || !participantUsernames || !Array.isArray(participantUsernames)) {
      return NextResponse.json({ error: 'Invalid group data' }, { status: 400 });
    }

    // Find participants by their usernames
    const participants = await User.find({ username: { $in: participantUsernames } });
    if (participants.length !== participantUsernames.length) {
      return NextResponse.json({ error: 'One or more participants not found' }, { status: 404 });
    }

    // Create new group (include the creator as a participant)
    const newGroup = await Group.create({
      name,
      participants: [userId, ...participants.map(p => p._id)],
      admin: userId
    });

    // Optionally populate the participants field before sending
    await newGroup.populate('participants', 'username');

    return NextResponse.json({ group: newGroup }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET: Retrieve all groups for the logged-in user (or all groups)
export async function GET(req: NextRequest) {
  await dbConnect();
  
  try {
    // Populate the "participants" field with only the "username" property
    const groups = await Group.find({}).populate('participants', 'username');
    return NextResponse.json({ groups }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH: Add a new participant to a group
export async function PATCH(req: NextRequest) {
  await dbConnect();
  
  const token = req.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as jwt.JwtPayload;
    const userId = decoded.id;

    const { newParticipantUsername, currentGroupId } = await req.json();

    if (!newParticipantUsername || !currentGroupId) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    // Find the participant by username
    const participant = await User.findOne({ username: newParticipantUsername });
    if (!participant) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const participantId = participant._id;
    
    // Find the group by ID
    const group = await Group.findById(currentGroupId);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    
    // Check if the requester is the group admin
    if (group.admin.toString() !== userId) {
      return NextResponse.json({ error: 'Not authorized to update this group' }, { status: 403 });
    }

    // Add the participant if they are not already in the group
    if (!group.participants.includes(participantId)) {
      group.participants.push(participantId);
      await group.save();
    }

    // Populate the participants field with the username property before returning
    await group.populate('participants', 'username');

    return NextResponse.json({ group }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
