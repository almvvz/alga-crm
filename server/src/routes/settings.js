import { Router } from "express";
import { withTransaction, query } from "../db.js";
import { badRequest } from "../errors.js";
import { requireAdmin } from "../auth.js";
import { bodyOf } from "../validate.js";

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const { rows } = await query("SELECT key, label, comment, kind, value::float AS value FROM settings ORDER BY sort");
  res.json(rows);
});

// Body: { values: { tutor_rate: 2500, noshow_share: 0.5, ... } }  (money in sen)
router.put("/", async (req, res) => {
  const { values } = bodyOf(req);
  if (!values || typeof values !== "object" || Array.isArray(values) || !Object.keys(values).length) {
    throw badRequest("Send the settings to change as { values: { key: number } }");
  }
  await withTransaction(async (c) => {
    for (const [key, raw] of Object.entries(values)) {
      const v = Number(raw);
      if (raw === "" || raw == null || !Number.isFinite(v) || v < 0) throw badRequest(`"${key}" must be a number, 0 or more`);
      const s = (await c.query("SELECT kind FROM settings WHERE key = $1", [key])).rows[0];
      if (!s) throw badRequest(`Unknown setting "${key}"`);
      if (s.kind === "money" && !Number.isInteger(v)) throw badRequest(`"${key}" must be whole sen`);
      if (key === "pack_lessons" && (!Number.isInteger(v) || v < 1)) throw badRequest("Lessons in a pack must be at least 1");
      if (key === "noshow_share" && v > 1) throw badRequest("Share of tutor rate must be between 0 and 1");
      await c.query("UPDATE settings SET value = $1 WHERE key = $2", [v, key]);
    }
  });
  const { rows } = await query("SELECT key, label, comment, kind, value::float AS value FROM settings ORDER BY sort");
  res.json(rows);
});

export default router;
