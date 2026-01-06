import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../db";
import { UserZodSchema, LoginZodSchema } from "../types";
import authMiddleware from "../middleware";

const router: Router = Router();

router.post("/signup", async (req, res) => {
  const parsed = UserZodSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.format(),
    });
  }

  const data = parsed.data;

  try {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const user = new User({
      name: data.name,
      email: data.email,
      password: hashed,
      role: data.role,
      supervisorId: data.supervisorId || null,
    });

    await user.save();

    const { password, ...out } = user.toObject();

    return res.status(201).json({
      success: true,
      data: out,
    });
  } catch (err: any) {
    console.error("Signup error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

router.post("/login", async (req, res) => {
  const parsed = LoginZodSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: parsed.error.format() });
  }

  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET || "dev_secret";
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      secret,
      { expiresIn: "7d" }
    );

    return res.status(200).json({ success: true, data: { token } });
  } catch (err: any) {
    console.error("Login error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const user = await User.findById(userId).select("name email role");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("Me error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

export { router as authRouter };
