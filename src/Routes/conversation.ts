import { Router } from "express";
import authMiddleware from "../middleware";
import mongoose from "mongoose";
import { Conversation, User, Message } from "../db";
import { ConversationCreateSchema, ConversationAssignSchema } from "../types";

const router = Router();

export const inMemoryMessages = new Map<
  string,
  Array<{
    senderId: string;
    senderRole: string;
    content: string;
    createdAt: Date;
  }>
>();

router.post("/", authMiddleware, async (req, res) => {
  const role = req.user?.role;
  if (role !== "candidate") {
    return res
      .status(403)
      .json({ success: false, error: "Forbidden, insufficient permissions" });
  }

  const parsed = ConversationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: parsed.error.format() });
  }

  const candidateId = req.user!.userId;
  const { supervisorId } = parsed.data;

  try {
    const existing = await Conversation.findOne({
      candidateId,
      status: { $in: ["open", "assigned"] },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Candidate already has an active conversation",
      });
    }

    const supervisorUser = await User.findById(supervisorId);
    if (!supervisorUser) {
      return res
        .status(404)
        .json({ success: false, error: "Supervisor not found" });
    }

    if (supervisorUser.role !== "supervisor") {
      return res
        .status(400)
        .json({ success: false, error: "Invalid supervisor role" });
    }

    const conv = new Conversation({
      candidateId,
      supervisorId,
      agentId: null,
      status: "open",
    });

    await conv.save();

    return res.status(201).json({
      success: true,
      data: {
        _id: conv._id.toString(),
        status: conv.status,
        supervisorId: conv.supervisorId.toString(),
      },
    });
  } catch (err: any) {
    console.error("Create conversation error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

router.post("/:id/assign", authMiddleware, async (req, res) => {
  const role = req.user?.role;
  if (!role || role !== "supervisor") {
    return res
      .status(403)
      .json({ success: false, error: "Forbidden: supervisors only" });
  }

  const convId = req.params.id;
  if (!mongoose.isValidObjectId(convId)) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid conversation id" });
  }

  const parsed = ConversationAssignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: parsed.error.format() });
  }

  const { agentId } = parsed.data;
  const supervisorId = req.user!.userId;

  try {
    const conv = await Conversation.findById(convId);
    if (!conv) {
      return res
        .status(404)
        .json({ success: false, error: "Conversation not found" });
    }

    if (conv.status === "closed") {
      return res.status(400).json({
        success: false,
        error: "Conversation already closed",
      });
    }

    if (conv.supervisorId.toString() !== supervisorId) {
      return res
        .status(403)
        .json({ success: false, error: "cannot assign agent" });
    }

    const agent = await User.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    if (agent.role !== "agent") {
      return res
        .status(400)
        .json({ success: false, error: "Invalid agent role" });
    }

    if (!agent.supervisorId || agent.supervisorId.toString() !== supervisorId) {
      return res
        .status(403)
        .json({ success: false, error: "Agent doesn't belong to you" });
    }

    conv.agentId = agent._id;
    conv.status = "open";
    await conv.save();

    return res.status(200).json({
      success: true,
      data: {
        conversationId: conv._id.toString(),
        agentId: agent._id.toString(),
        supervisorId: conv.supervisorId.toString(),
      },
    });
  } catch (err: any) {
    console.error("Assign agent error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  const convId = req.params.id;
  if (!mongoose.isValidObjectId(convId)) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid conversation id" });
  }

  try {
    const conv = await Conversation.findById(convId);
    if (!conv)
      return res
        .status(404)
        .json({ success: false, error: "Conversation not found" });

    const role = req.user?.role;
    const userId = req.user?.userId;

    if (role !== "admin") {
      const hasAccess =
        (role === "supervisor" && conv.supervisorId.toString() === userId) ||
        (role === "agent" && conv.agentId?.toString() === userId) ||
        (role === "candidate" && conv.candidateId.toString() === userId);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "Forbidden, insufficient permissions",
        });
      }
    }

    let messages: Array<{
      senderId: string;
      senderRole: string;
      content: string;
      createdAt: Date;
    }> = [];
    if (conv.status === "assigned" || conv.status === "open") {
      messages = inMemoryMessages.get(convId) || [];
    } else if (conv.status === "closed") {
      const persisted = await Message.find({ conversationId: conv._id })
        .sort({ createdAt: 1 })
        .lean();
      messages = persisted.map((m: any) => ({
        senderId: m.senderId.toString(),
        senderRole: m.senderRole,
        content: m.content,
        createdAt: m.createdAt,
      }));
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: conv._id.toString(),
        status: conv.status,
        agentId: conv.agentId ? conv.agentId.toString() : null,
        supervisorId: conv.supervisorId.toString(),
        candidateId: conv.candidateId.toString(),
        messages,
      },
    });
  } catch (err: any) {
    console.error("Get conversation error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

router.post("/:id/close", authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== "admin" && role !== "supervisor") {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  const convId = req.params.id;
  if (!mongoose.isValidObjectId(convId)) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid conversation id" });
  }

  try {
    const conv = await Conversation.findById(convId);
    if (!conv)
      return res
        .status(404)
        .json({ success: false, error: "Conversation not found" });

    if (role === "supervisor" && conv.supervisorId.toString() !== userId) {
      return res
        .status(403)
        .json({ success: false, error: "Forbidden, insufficient permissions" });
    }

    if (conv.status !== "open") {
      return res
        .status(400)
        .json({ success: false, error: "Conversation already closed" });
    }

    conv.status = "closed";
    await conv.save();

    return res.status(200).json({
      success: true,
      data: {
        conversationId: conv._id.toString(),
        status: conv.status,
      },
    });
  } catch (err: any) {
    console.error("Close conversation error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

export { router as conversationRouter };
