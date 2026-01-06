import mongoose, { Schema, Document, Model } from "mongoose";
import "dotenv/config";

mongoose.connect(process.env.MONGO_URL!);

// ______________ // User Table

type UserRole = "admin" | "supervisor" | "agent" | "candidate";

export interface IUser extends Document { 
  name: string;
  email: string;
  password: string;
  role: UserRole;
  supervisorId: mongoose.Types.ObjectId | null; 
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "supervisor", "agent", "candidate"],
    required: true,
  },
  supervisorId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
    required: function (this: IUser) {
      return this.role === "agent";
    },
  },
});

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

// _______________ // Conversation table

export type ConversationStatus = "open" | "assigned" | "closed";

export interface IConversation extends Document {
  candidateId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId | null;
  supervisorId: mongoose.Types.ObjectId;
  status: ConversationStatus;
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
  candidateId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  agentId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  supervisorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: {
    type: String,
    enum: ["open", "assigned", "closed"],
    required: true,
    default: "open",
  },
  createdAt: { type: Date, default: Date.now },
});

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);

// ___________________ // Message Table

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderRole: string;
  content: string;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  senderRole: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);