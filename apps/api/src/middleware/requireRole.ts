import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types/auth";

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    next();
  };
}
