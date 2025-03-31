import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver?: mongoose.Types.ObjectId;
  group?: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // `receiver` is required only if `group` is not provided
    receiver: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: function(this: IMessage) { return !this.group; }
    },
    // `group` is required only if `receiver` is not provided
    group: { 
      type: Schema.Types.ObjectId, 
      ref: 'Group', 
      required: function(this: IMessage) { return !this.receiver; }
    },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
