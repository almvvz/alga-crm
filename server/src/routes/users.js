import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import { bodyOf, parseId, reqText } from "../validate.js";
import { checkPasswordStrength, hashPassword, requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

const COLUMNS = "id, email, full_name, role, active, must_change_password, created_at";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(v) {
  const email = reqText(v, "Email", 200).toLowerCase();
  if (!EMAIL.test(email)) throw badRequest("Email doesn't look right");
  return email;
}

router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNS.split(", ").map((c) => `u.${c}`).join(", ")}
       FROM users u ORDER BY u.active DESC, u.full_name`
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const b = bodyOf(req);
  const email = parseEmail(b.email);
  const full_name = reqText(b.full_name, "Full name", 100);
  const role = "admin"; // only founders have accounts for now
  checkPasswordStrength(b.password);

  try {
    const { rows } = await query(
      `INSERT INTO users (email, full_name, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING ${COLUMNS}`,
      [email, full_name, await hashPassword(b.password), role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "A user with that email already exists");
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const b = bodyOf(req);
  const full_name = reqText(b.full_name, "Full name", 100);
  const role = "admin";
  const active = b.active === true || b.active === "true";

  const user = await withTransaction(async (c) => {
    const existing = (await c.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!existing) throw notFound("User not found");

    const losesAdmin = existing.role === "admin" && existing.active && (role !== "admin" || !active);
    if (losesAdmin) {
      if (id === req.user.id) throw badRequest("You can't remove your own admin access");
      const others = (
        await c.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active AND id <> $1", [id])
      ).rows[0].n;
      if (others === 0) throw badRequest("There must be at least one active admin");
    }

    const { rows } = await c.query(
      `UPDATE users SET full_name = $1, role = $2, active = $3 WHERE id = $4 RETURNING ${COLUMNS}`,
      [full_name, role, active, id]
    );
    if (!active) await c.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    return rows[0];
  });
  res.json(user);
});

// For a tutor who forgot their password: set a temporary one, they must change it at next login.
router.post("/:id/reset-password", async (req, res) => {
  const id = parseId(req.params.id);
  const { password } = bodyOf(req);
  checkPasswordStrength(password);

  const { rowCount } = await query(
    "UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2",
    [await hashPassword(password), id]
  );
  if (!rowCount) throw notFound("User not found");
  await query("DELETE FROM sessions WHERE user_id = $1", [id]);
  res.status(204).end();
});

export default router;
