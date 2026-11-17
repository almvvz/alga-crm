import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { query } from "../db.js";
import { HttpError } from "../errors.js";
import { bodyOf } from "../validate.js";
import {
  burnTime,
  checkPasswordStrength,
  createSession,
  destroySession,
  hashPassword,
  needUser,
  publicUser,
  verifyPassword,
} from "../auth.js";

const router = Router();

// 10 wrong passwords per 15 minutes per IP address. Successful logins don't count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  skip: () => config.isTest,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many failed attempts. Try again in 15 minutes." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const body = bodyOf(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const { rows } = await query("SELECT * FROM users WHERE lower(email) = $1", [email]);
  const user = rows[0];

  let ok = false;
  if (user) ok = await verifyPassword(password, user.password_hash);
  else await burnTime(password);

  // Same message for "no such user", "wrong password" and "deactivated".
  if (!user || !ok || !user.active) throw new HttpError(401, "Wrong email or password");

  await createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

router.get("/me", needUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post("/change-password", needUser, async (req, res) => {
  const body = bodyOf(req);
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await verifyPassword(String(body.current_password ?? ""), rows[0].password_hash))) {
    throw new HttpError(400, "Current password is wrong");
  }
  checkPasswordStrength(body.new_password);
  if (body.new_password === body.current_password) {
    throw new HttpError(400, "New password must be different from the current one");
  }

  await query("UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2", [
    await hashPassword(body.new_password),
    req.user.id,
  ]);
  // Sign out every other device.
  await query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [req.user.id, req.sessionHash]);
  res.json({ user: publicUser({ ...req.user, must_change_password: false }) });
});

export default router;
