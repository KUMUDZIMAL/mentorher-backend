// src/models/Registration.ts
import mongoose from "mongoose";
const { Schema } = mongoose;

const RegistrationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  isMentor: { type: Boolean, required: true },
  registeredAt: { type: Date, default: Date.now },
});

// Check if the model already exists to prevent OverwriteModelError.
export default mongoose.models.Registration || mongoose.model("Registration", RegistrationSchema);
