import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { token, email } = await req.json().catch(() => ({ token: '', email: '' }));

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }
    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    await dbConnect();

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetToken: tokenHash,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    if (user.email.toLowerCase() !== email.trim().toLowerCase()) {
      return NextResponse.json(
        { error: 'This email does not match the account for this reset link.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Verify reset error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
