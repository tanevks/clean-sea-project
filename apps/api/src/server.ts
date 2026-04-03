import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { campaignsRouter } from "./routes/campaigns";
import { chatRouter } from "./routes/chat";
import { initiativesRouter } from "./routes/initiatives";
import { moderationRouter } from "./routes/moderation";
import { notificationsRouter } from "./routes/notifications";
import { publicRouter } from "./routes/public";
import { reportsRouter } from "./routes/reports";
import { uploadsRouter } from "./routes/uploads";

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/v1/admin", adminRouter);
  app.use("/v1/auth", authRouter);
  app.use("/v1/campaigns", campaignsRouter);
  app.use("/v1/chat", chatRouter);
  app.use("/v1/initiatives", initiativesRouter);
  app.use("/v1/moderation", moderationRouter);
  app.use("/v1/notifications", notificationsRouter);
  app.use("/v1/public", publicRouter);
  app.use("/v1/uploads", uploadsRouter);
  app.use("/v1/reports", reportsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    res.status(500).json({
      error: message
    });
  });

  return app;
}
