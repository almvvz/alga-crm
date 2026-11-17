import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { requireAdmin } from "../auth.js";
import { bodyOf, oneOf, optBool, optDate, optInt, optText, parseId, reqDate } from "../validate.js";

export const FORMATS = ["Intensive", "Duo", "1-on-1 single", "1-on-1 pack", "Solo after duo", "Open review"];
export const LESSON_STATUSES = [
  "Scheduled", "Held", "Rescheduled (notice given)", "Student cancelled >=24h",
  "Student cancelled <24h (lesson burned)", "No-show (rescheduled)", "Tutor cancelled",
];

const SELECT = `
  SELECT l.*, t.name AS tutor_name,
         COALESCE((SELECT json_agg(json_build_object('id', s.id, 'full_name', s.full_name) ORDER BY s.full_name)
                     FROM lesson_students ls JOIN students s ON s.id = ls.student_id
                    WHERE ls.lesson_id = l.id), '[]'::json) AS students
    FROM lesson_calc l LEFT JOIN tutors t ON t.id = l.tutor_id`;

function parseLesson(b) {
  const time = String(b.lesson_time ?? "").trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) throw badRequest("Time must look like 17:00");
  const ids = b.student_ids ?? [];
  if (!Array.isArray(ids)) throw badRequest("student_ids must be a list");
  const student_ids = [...new Set(ids.map((x) => optInt(x, "Student", { min: 1 })))];
  const format = oneOf(b.format, FORMATS, "Format");
  if (format === "Duo" && student_ids.length > 2) throw badRequest("A duo lesson has at most 2 students");
  if (["1-on-1 single", "1-on-1 pack", "Solo after duo"].includes(format) && student_ids.length > 1) {
    throw badRequest(`${format} lessons have one student`);
  }
  return {
    lesson_date: reqDate(b.lesson_date, "Date"),
    lesson_time: time || null,
    subject: optText(b.subject, "Subject", 100),
    tutor_id: optInt(b.tutor_id, "Tutor", { min: 1 }),
    format,
    group_code: optText(b.group_code, "Group / code", 40),
    status: oneOf(b.status || "Scheduled", LESSON_STATUSES, "Status"),
    logged_same_day: optBool(b.logged_same_day),
    recording_saved: optBool(b.recording_saved),
    notes: optText(b.notes, "Notes", 2000),
    student_ids,
  };
}
const FIELDS = ["lesson_date", "lesson_time", "subject", "tutor_id", "format", "group_code", "status", "logged_same_day", "recording_saved", "notes"];

async function saveStudents(c, lessonId, ids) {
  await c.query("DELETE FROM lesson_students WHERE lesson_id = $1", [lessonId]);
  if (ids.length) {
    await c.query("INSERT INTO lesson_students (lesson_id, student_id) SELECT $1, unnest($2::int[])", [lessonId, ids]);
  }
}

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (req.query.from) add("l.lesson_date >= ?", optDate(req.query.from, "from"));
  if (req.query.to) add("l.lesson_date <= ?", optDate(req.query.to, "to"));
  if (req.query.tutor_id) add("l.tutor_id = ?", parseId(req.query.tutor_id, "tutor id"));
  if (req.query.status) add("l.status = ?", oneOf(req.query.status, LESSON_STATUSES, "status"));
  if (req.query.format) add("l.format = ?", oneOf(req.query.format, FORMATS, "format"));
  if (req.query.group_code) add("l.group_code = ?", String(req.query.group_code));
  if (req.query.student_id) {
    add("EXISTS (SELECT 1 FROM lesson_students x WHERE x.lesson_id = l.id AND x.student_id = ?)", parseId(req.query.student_id, "student id"));
  }
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const { rows } = await query(
    `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY l.lesson_date DESC, l.lesson_time DESC NULLS LAST, l.id DESC LIMIT ${limit}`,
    params
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { rows } = await query(`${SELECT} WHERE l.id = $1`, [parseId(req.params.id, "lesson id")]);
  if (!rows[0]) throw notFound("Lesson not found");
  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const l = parseLesson(bodyOf(req));
  const id = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO lessons (${FIELDS.join(", ")}, created_by) VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(", ")}, $${FIELDS.length + 1}) RETURNING id`,
      [...FIELDS.map((f) => l[f]), req.user.id]
    );
    await saveStudents(c, rows[0].id, l.student_ids);
    return rows[0].id;
  });
  res.status(201).json((await query(`${SELECT} WHERE l.id = $1`, [id])).rows[0]);
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id, "lesson id");
  const l = parseLesson(bodyOf(req));
  await withTransaction(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE lessons SET ${FIELDS.map((f, i) => `${f} = $${i + 1}`).join(", ")} WHERE id = $${FIELDS.length + 1}`,
      [...FIELDS.map((f) => l[f]), id]
    );
    if (!rowCount) throw notFound("Lesson not found");
    await saveStudents(c, id, l.student_ids);
  });
  res.json((await query(`${SELECT} WHERE l.id = $1`, [id])).rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await query("DELETE FROM lessons WHERE id = $1", [parseId(req.params.id, "lesson id")]);
  if (!rowCount) throw notFound("Lesson not found");
  res.status(204).end();
});

export default router;
