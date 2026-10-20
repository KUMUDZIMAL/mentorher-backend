import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json().catch(() => ({ token: '', password: '' }));

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
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

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        // Single use: clear the token once the password changes.
        $unset: { resetToken: '', resetTokenExpiry: '' },
      }
    );

    return NextResponse.json({ success: true, message: 'Password updated. You can log in now.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
