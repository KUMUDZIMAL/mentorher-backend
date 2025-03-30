import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb'; // Adjust path as needed
import User from '@/models/User'; // Adjust path as needed
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { username, email, age, password } = await req.json();

    // Input Validation
    if (!username || !email || !age ||  !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    await dbConnect();

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user
    const newUser = await User.create({
      username,
      email,
      age, // Make sure to save the age
     
      password: hashedPassword,
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    console.error('Unexpected error during registration:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
