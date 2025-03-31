import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  age: number; // Make age optional, and save it from the registration form
  gender: string;
  password: string;

}

const UserSchema: Schema<IUser> = new Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number }, // Age is still part of the schema
    gender: { type: String, default:'Female', required:false}, 
    password: { type: String, required: true },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
