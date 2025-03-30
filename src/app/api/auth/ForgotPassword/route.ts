import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
    try {
      const { email } = await req.json();
  
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }
  
      const client = new MongoClient(process.env.MONGODB_URI as string);
  
      try {
        await client.connect();
        const db = client.db('test');
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });
  
        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
  
        const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
        const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').trim();

        if (!FRONTEND_URL) {
          throw new Error('FRONTEND_URL is not defined in the environment variables.');
        }
        
        const resetUrl = `${FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
        
        console.log('Generated reset URL:', resetUrl); // Debugging log
        
  
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
  
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Password Reset Request',
          html: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">Reset Password</a></p>`,
        };
  
        await transporter.sendMail(mailOptions);
        return NextResponse.json({ message: 'Password reset link has been sent to your email.' }, { status: 200 });
      } catch (error) {
        console.error('Error in database operation:', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      } finally {
        await client.close();
      }
    } catch (error) {
      console.error('Error in forgot password API:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
  
  