import { z } from "zod";

export const UserZodSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(["admin", "supervisor", "agent", "candidate"]),
    supervisorId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Invalid ObjectId")
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "agent" && !data.supervisorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "supervisorId is required for agents",
        path: ["supervisorId"],
      });
    }
  });
export type UserInput = z.infer<typeof UserZodSchema>;

export const ConversationZodSchema = z.object({
  candidateId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
  agentId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid ObjectId")
    .nullable()
    .optional(),
  supervisorId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
  status: z.enum(["open", "assigned", "closed"]).default("open"),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type ConversationInput = z.infer<typeof ConversationZodSchema>;

export const ConversationCreateSchema = z.object({
  supervisorId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
});

export type ConversationCreateInput = z.infer<typeof ConversationCreateSchema>;

export const ConversationAssignSchema = z.object({
  agentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
});

export type ConversationAssignInput = z.infer<typeof ConversationAssignSchema>;

export const MessageZodSchema = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
  senderId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
  senderRole: z.enum(["admin", "supervisor", "agent", "candidate"]),
  content: z.string().min(1, "Message content is required"),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type MessageInput = z.infer<typeof MessageZodSchema>;

export const LoginZodSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof LoginZodSchema>;
