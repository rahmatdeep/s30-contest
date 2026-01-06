import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type JwtPayload = {
  userId: string;
  role: "admin" | "supervisor" | "agent" | "candidate";
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = req.header("authorization") || req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({
        success: false,
        error: "Unauthorized, token missing or invalid",
      });
  }

  const token = auth.slice("Bearer ".length).trim();
  const secret = process.env.JWT_SECRET || "dev_secret";

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (!decoded || !decoded.userId || !decoded.role) {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized, token missing or invalid" });
    }
    req.user = { userId: decoded.userId, role: decoded.role };
    return next();
  } catch (err: any) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
  }
}

export default authMiddleware;
