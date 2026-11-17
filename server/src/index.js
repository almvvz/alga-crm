import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { query } from "./db.js";
import { HttpError } from "./errors.js";
import { attachUser, sameOriginOnly } from "./auth.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import studentsRouter from "./routes/students.js";
import tutorsRouter from "./routes/tutors.js";
import lessonsRouter from "./routes/lessons.js";
import financeRouter from "./routes/finance.js";
import settlementRouter from "./routes/settlement.js";
import settingsRouter from "./routes/settings.js";
import dashboardRouter from "./routes/dashboard.js";
import exportsRouter from "./routes/exports.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // On a host like Render, a proxy sits in front of us. Trust it so we see
  // the visitor's real IP (for rate limiting) and know the request was https.
  if (config.isProd) app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: { "upgrade-insecure-requests": null } },
      hsts: config.isProd,
    })
  );
  if (!config.isTest) app.use(morgan(config.isProd ? "combined" : "dev"));
  app.use(express.json({ limit: "2mb" }));

  // Does NOT touch the database, so a hosting health check never wakes a sleeping free database.
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/health/db", async (req, res) => {
    await query("SELECT 1");
    res.json({ ok: true, db: true });
  });

  app.use("/api", sameOriginOnly, attachUser);
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/tutors", tutorsRouter);
  app.use("/api/lessons", lessonsRouter);
  app.use("/api/finance", financeRouter);
  app.use("/api/settlement", settlementRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/export", exportsRouter);
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // In production this one server also serves the built React app.
  const dist = path.resolve(config.clientDist ?? path.join(here, "..", "..", "client", "dist"));
  if ((config.clientDist || config.isProd) && fs.existsSync(path.join(dist, "index.html"))) {
    app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(dist, { index: false }));
    // Any other page address (/students/3, /groups...) is handled by React Router.
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.set("Cache-Control", "no-cache").sendFile(path.join(dist, "index.html"));
    });
  }

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }) });
    }
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body isn't valid JSON" });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "That upload is too large" });
    if (err.code === "23505") return res.status(409).json({ error: "That record already exists" });
    if (err.code === "23503") return res.status(409).json({ error: "A related record is missing or still in use" });
    if (["22P02", "22003", "22007", "22008"].includes(err.code)) {
      return res.status(400).json({ error: "One of the values isn't valid" });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server" });
  });

  return app;
}
