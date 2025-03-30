import { NextResponse } from 'next/server';

// In-memory storage for rooms and messages (replace with database in production)
let rooms = [
  { id: '1', name: 'General Chat', participants: 5 },
  { id: '2', name: 'Support Group', participants: 3 },
];

let messages = [
  {
    id: '1',
    roomId: '1',
    userId: 'user1',
    username: 'User 1',
    content: 'Welcome to General Chat!',
    timestamp: new Date(),
  },
  {
    id: '2',
    roomId: '2',
    userId: 'user2',
    username: 'User 2',
    content: 'Welcome to Support Group!',
    timestamp: new Date(),
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');

  if (roomId) {
    // Return messages for specific room
    const roomMessages = messages.filter(msg => msg.roomId === roomId);
    return NextResponse.json(roomMessages);
  }

  // Return all rooms
  return NextResponse.json(rooms);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === 'CREATE_ROOM') {
    const newRoom = {
      id: String(Date.now()),
      name: body.name,
      participants: 1,
    };
    rooms.push(newRoom);
    return NextResponse.json(newRoom);
  }

  if (body.type === 'UPDATE_PARTICIPANTS') {
    const { roomId, change } = body; // change can be +1 or -1
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      room.participants += change;
      return NextResponse.json(room);
    }
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (body.type === 'SEND_MESSAGE') {
    const newMessage = {
      id: String(Date.now()),
      roomId: body.roomId,
      userId: body.userId,
      username: body.username,
      content: body.content,
      timestamp: new Date(),
    };
    messages.push(newMessage);
    return NextResponse.json(newMessage);
  }

  return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
}