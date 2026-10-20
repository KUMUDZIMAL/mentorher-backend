import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';

const RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Basic per-process rate limit: 3 requests per email per 10 minutes.
const attempts = new Map<string, number[]>();
function isRateLimited(email: string): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const list = (attempts.get(email) || []).filter((t) => now - t < window);
  list.push(now);
  attempts.set(email, list);
  return list.length > 3;
}

function frontendUrl(): string {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
  return process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://mentorher.vercel.app';
}

async function sendResetEmail(to: string, link: string): Promise<boolean> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;

  try {
    const nodemailer = await import('nodemailer');
    const port = Number(SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({
      from: EMAIL_FROM || SMTP_USER,
      to,
      subject: 'Reset your MentorHer password',
      text: `Someone requested a password reset for your MentorHer account.\n\n` +
        `Open this link within 15 minutes to choose a new password:\n${link}\n\n` +
        `If you didn't request this, you can safely ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#7c3aed">Reset your password</h2>
          <p>Someone requested a password reset for your MentorHer account.</p>
          <p><a href="${link}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Choose a new password</a></p>
          <p style="color:#666;font-size:13px">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
        </div>`,
    });
    return true;
  } catch (err) {
    console.error('[forgot-password] email send failed:', err);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({ email: '' }));

    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    if (isRateLimited(email.toLowerCase())) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    await dbConnect();

    const user = await User.findOne({ email });

    // Always answer the same way so the endpoint can't be used to
    // discover which emails are registered.
    const response: Record<string, unknown> = {
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    };

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await User.updateOne(
        { _id: user._id },
        { $set: { resetToken: tokenHash, resetTokenExpiry: new Date(Date.now() + RESET_TTL_MS) } }
      );

      const link = `${frontendUrl()}/auth/reset-password?token=${token}`;
      const emailed = await sendResetEmail(user.email, link);

      // Without SMTP (local dev), expose the link so the flow stays testable.
      if (!emailed && process.env.NODE_ENV !== 'production') {
        response.devResetLink = link;
        console.log('[forgot-password] dev reset link:', link);
      }
      if (!emailed && process.env.NODE_ENV === 'production') {
        console.error('[forgot-password] SMTP not configured — reset email could not be sent.');
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
