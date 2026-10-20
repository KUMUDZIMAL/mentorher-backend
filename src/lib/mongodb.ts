import { applyDnsFix } from './dnsfix';
import mongoose from 'mongoose';

applyDnsFix();

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable.');
}

const MONGODB_URI: string = process.env.MONGODB_URI;

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: Cached;
}

let cached: Cached = global.mongoose || { conn: null, promise: null };

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    applyDnsFix();
    cached.promise = mongoose
      .connect(MONGODB_URI)
      .then((mongoose) => mongoose)
      .catch((err) => {
        // Do not cache failures — allow the next request to retry.
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

if (process.env.NODE_ENV !== 'production') global.mongoose = cached;
