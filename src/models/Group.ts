// models/Group.ts
import mongoose from 'mongoose';

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Group || mongoose.model('Group', GroupSchema);

// Update your Message model
// models/Message.ts
const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Add group field and make receiver optional
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});