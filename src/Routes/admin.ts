import { Router } from "express";
import authMiddleware from "../middleware";
import { User, Conversation } from "../db";

const router = Router();

router.get("/analytics", authMiddleware, async (req, res) => {
  if (req.user?.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, error: "Forbidden, insufficient permissions" });
  }

  try {
    const supervisors = await User.find({ role: "supervisor" }).lean();

    const analytics = await Promise.all(
      supervisors.map(async (sup) => {
        const agents = await User.find({
          role: "agent",
          supervisorId: sup._id,
        }).lean();
        const agentIds = agents.map((a) => a._id);

        const conversationsHandled = await Conversation.countDocuments({
          agentId: { $in: agentIds },
          status: "closed",
        });

        return {
          supervisorId: sup._id.toString(),
          supervisorName: sup.name,
          agents: agents.length,
          conversationsHandled: conversationsHandled,
        };
      })
    );

    return res.status(200).json({ success: true, data: analytics });
  } catch (err) {
    console.error("Admin analytics error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

export { router as adminRouter };
