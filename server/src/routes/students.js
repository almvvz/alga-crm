import { Router } from "express";
import { query } from "../db.js";
import { conflict, notFound } from "../errors.js";
import { requireAdmin } from "../auth.js";
import { bodyOf, oneOf, optBool, optInt, optText, parseId, reqText } from "../validate.js";

export const PRODUCTS = ["Intensive", "Duo", "1-on-1 single", "1-on-1 pack", "Solo after duo"];
export const STUDENT_STATUSES = ["Active", "Finished", "Left with partial refund", "100% refund"];

// S-001 style code, built from the id. remaining = lessons paid - lessons held.
export const STUDENT_SELECT = `
  SELECT v.*, 'S-' || lpad(v.id::text, 3, '0') AS code,
         (v.lessons_paid - v.lessons_held) AS lessons_remaining
    FROM student_summary v`;

export function parseStudent(b) {
  return {
    full_name: reqText(b.full_name, "Name", 100),
    mobile: optText(b.mobile, "Contact", 60),
    subject: optText(b.subject, "Subject", 100),
    product: b.product ? oneOf(b.product, PRODUCTS, "Product") : null,
    tutor_id: optInt(b.tutor_id, "Tutor", { min: 1 }),
    group_code: optText(b.group_code, "Group / code", 40),
    lessons_paid: optInt(b.lessons_paid, "Lessons paid", { min: 0, max: 1000 }) ?? 0,
    status: oneOf(b.status || "Active", STUDENT_STATUSES, "Status"),
    source: optText(b.source, "Source", 60),
    programme: optText(b.programme, "Course / programme", 100),
    year: optInt(b.year, "Year", { min: 1, max: 20 }),
    rating: optInt(b.rating, "Lesson rating", { min: 1, max: 5 }),
    ok_to_publish: optBool(b.ok_to_publish),
    notes: optText(b.notes, "Notes", 2000),
  };
}

const FIELDS = [
  "full_name", "mobile", "subject", "product", "tutor_id", "group_code", "lessons_paid",
  "status", "source", "programme", "year", "rating", "ok_to_publish", "notes",
];

// Excel rule: names must be unique, because lessons are matched by student.
async function assertUniqueName(name, exceptId = 0) {
  const { rowCount } = await query("SELECT 1 FROM students WHERE lower(full_name) = lower($1) AND id <> $2", [name, exceptId]);
  if (rowCount) throw conflict(`A student called "${name}" already exists`);
}

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(String(req.query.status)); where.push(`v.status = $${params.length}`); }
  if (req.query.tutor_id) { params.push(parseId(req.query.tutor_id, "tutor id")); where.push(`v.tutor_id = $${params.length}`); }
  if (req.query.q) {
    params.push(`%${String(req.query.q).trim()}%`);
    where.push(`(v.full_name ILIKE $${params.length} OR v.mobile ILIKE $${params.length} OR v.group_code ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `${STUDENT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY v.id DESC`,
    params
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "student id");
  const { rows } = await query(`${STUDENT_SELECT} WHERE v.id = $1`, [id]);
  if (!rows[0]) throw notFound("Student not found");
  const [lessons, payments] = await Promise.all([
    query(
      `SELECT l.id, l.lesson_date, l.lesson_time, l.subject, l.format, l.status, l.revenue_cents, t.name AS tutor_name
         FROM lesson_calc l
         JOIN lesson_students ls ON ls.lesson_id = l.id AND ls.student_id = $1
         LEFT JOIN tutors t ON t.id = l.tutor_id
        ORDER BY l.lesson_date DESC, l.lesson_time DESC NULLS LAST, l.id DESC`,
      [id]
    ),
    query(
      `SELECT f.id, f.entry_date, f.type, f.amount_cents, f.method, f.purpose, u.full_name AS handled_by_name
         FROM finance_entries f JOIN users u ON u.id = f.handled_by
        WHERE f.student_id = $1 ORDER BY f.entry_date DESC, f.id DESC`,
      [id]
    ),
  ]);
  res.json({ ...rows[0], lessons: lessons.rows, payments: payments.rows });
});

router.post("/", async (req, res) => {
  const s = parseStudent(bodyOf(req));
  await assertUniqueName(s.full_name);
  const { rows } = await query(
    `INSERT INTO students (${FIELDS.join(", ")}) VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    FIELDS.map((f) => s[f])
  );
  const [created] = (await query(`${STUDENT_SELECT} WHERE v.id = $1`, [rows[0].id])).rows;
  res.status(201).json(created);
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id, "student id");
  const s = parseStudent(bodyOf(req));
  await assertUniqueName(s.full_name, id);
  const { rowCount } = await query(
    `UPDATE students SET ${FIELDS.map((f, i) => `${f} = $${i + 1}`).join(", ")} WHERE id = $${FIELDS.length + 1}`,
    [...FIELDS.map((f) => s[f]), id]
  );
  if (!rowCount) throw notFound("Student not found");
  const [updated] = (await query(`${STUDENT_SELECT} WHERE v.id = $1`, [id])).rows;
  res.json(updated);
});

// Students with lessons can't be deleted (it would rewrite history): set status instead.
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id, "student id");
  const used = await query("SELECT 1 FROM lesson_students WHERE student_id = $1 LIMIT 1", [id]);
  if (used.rowCount) throw conflict("This student has lessons logged. Change their status to Finished instead of deleting.");
  const { rowCount } = await query("DELETE FROM students WHERE id = $1", [id]);
  if (!rowCount) throw notFound("Student not found");
  res.status(204).end();
});

export default router;
