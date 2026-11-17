import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { conflict, notFound } from "../errors.js";
import { requireAdmin } from "../auth.js";
import { bodyOf, oneOf, optBool, optDate, optInt, optText, parseId, reqText } from "../validate.js";

export const TUTOR_STATUSES = ["Candidate", "Active", "On hold", "Finished"];
const SCORE_KEYS = ["explanation", "exam_knowledge", "contact", "responsibility", "availability"];

// Excel rule: hire if hard filters passed, average >= 4, and nobody gave 2 or
// less for "explanation" or "contact".
export function decide(tutor, scores) {
  const all = scores.flatMap((s) => SCORE_KEYS.map((k) => s[k])).filter((v) => v != null);
  if (!all.length) return { average: null, decision: null };
  const average = all.reduce((a, b) => a + b, 0) / all.length;
  const key = scores.flatMap((s) => [s.explanation, s.contact]).filter((v) => v != null);
  const min = Math.min(...key);
  let decision;
  if (tutor.hard_filters == null) decision = "Fill in the filters";
  else decision = tutor.hard_filters && average >= 4 && min > 2 ? "Hire" : "Don't hire";
  return { average: Math.round(average * 100) / 100, decision };
}

function parseTutor(b) {
  return {
    name: reqText(b.name, "Name", 100),
    contact: optText(b.contact, "Contact", 100),
    subject: optText(b.subject, "Subject", 100),
    major: optText(b.major, "Major", 100),
    year_of_study: optText(b.year_of_study, "Year of study", 40),
    grade: optText(b.grade, "Grade", 40),
    lecturer: optText(b.lecturer, "Lecturer", 100),
    own_exam_dates: optText(b.own_exam_dates, "Own exam dates", 200),
    availability: optText(b.availability, "Availability", 300),
    trial_date: optDate(b.trial_date, "Trial lesson date"),
    hard_filters: b.hard_filters === "" || b.hard_filters == null ? null : optBool(b.hard_filters),
    rules_signed: optBool(b.rules_signed),
    agreed_rate_cents: optInt(b.agreed_rate_cents, "Agreed rate", { min: 0, max: 1_000_000 }),
    status: oneOf(b.status || "Candidate", TUTOR_STATUSES, "Status"),
    notes: optText(b.notes, "Notes", 2000),
  };
}
const FIELDS = [
  "name", "contact", "subject", "major", "year_of_study", "grade", "lecturer", "own_exam_dates",
  "availability", "trial_date", "hard_filters", "rules_signed", "agreed_rate_cents", "status", "notes",
];

const TUTOR_STATS = `
  SELECT t.*,
         COALESCE((SELECT SUM(tutor_cents) FROM lesson_calc l WHERE l.tutor_id = t.id), 0)::BIGINT AS earned_cents,
         COALESCE((SELECT SUM(amount_cents) FROM finance_entries f WHERE f.tutor_id = t.id AND f.type = 'Tutor payout'), 0)::BIGINT AS paid_cents,
         (SELECT COUNT(*) FROM lesson_calc l WHERE l.tutor_id = t.id AND l.status = 'Held')::INT AS lessons_held
    FROM tutors t`;

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const [tutors, scores] = await Promise.all([
    query(`${TUTOR_STATS} ORDER BY t.status = 'Active' DESC, t.name`),
    query("SELECT * FROM tutor_scores"),
  ]);
  res.json(
    tutors.rows.map((t) => ({
      ...t,
      owed_cents: Number(t.earned_cents) - Number(t.paid_cents),
      ...decide(t, scores.rows.filter((s) => s.tutor_id === t.id)),
    }))
  );
});

// Scoring is blind: you only see the other founders' scores after you submit yours.
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "tutor id");
  const { rows } = await query(`${TUTOR_STATS} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw notFound("Tutor not found");
  const scores = (
    await query(
      `SELECT s.*, u.full_name AS user_name FROM tutor_scores s JOIN users u ON u.id = s.user_id
        WHERE s.tutor_id = $1 ORDER BY u.full_name`,
      [id]
    )
  ).rows;
  const mine = scores.find((s) => s.user_id === req.user.id) ?? null;
  const visible = mine ? scores : [];
  res.json({
    ...rows[0],
    owed_cents: Number(rows[0].earned_cents) - Number(rows[0].paid_cents),
    my_scores: mine,
    scores: visible,
    hidden_scores: mine ? 0 : scores.length,
    ...decide(rows[0], scores),
  });
});

router.post("/", async (req, res) => {
  const t = parseTutor(bodyOf(req));
  const dup = await query("SELECT 1 FROM tutors WHERE lower(name) = lower($1)", [t.name]);
  if (dup.rowCount) throw conflict(`A tutor called "${t.name}" already exists`);
  const { rows } = await query(
    `INSERT INTO tutors (${FIELDS.join(", ")}) VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
    FIELDS.map((f) => t[f])
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id, "tutor id");
  const t = parseTutor(bodyOf(req));
  const dup = await query("SELECT 1 FROM tutors WHERE lower(name) = lower($1) AND id <> $2", [t.name, id]);
  if (dup.rowCount) throw conflict(`A tutor called "${t.name}" already exists`);
  const { rows } = await query(
    `UPDATE tutors SET ${FIELDS.map((f, i) => `${f} = $${i + 1}`).join(", ")} WHERE id = $${FIELDS.length + 1} RETURNING *`,
    [...FIELDS.map((f) => t[f]), id]
  );
  if (!rows[0]) throw notFound("Tutor not found");
  res.json(rows[0]);
});

// Saves the logged-in founder's own scores.
router.put("/:id/scores", async (req, res) => {
  const id = parseId(req.params.id, "tutor id");
  const b = bodyOf(req);
  const vals = SCORE_KEYS.map((k) => optInt(b[k], k.replace("_", " "), { min: 1, max: 5 }));
  await withTransaction(async (c) => {
    if (!(await c.query("SELECT 1 FROM tutors WHERE id = $1", [id])).rowCount) throw notFound("Tutor not found");
    await c.query(
      `INSERT INTO tutor_scores (tutor_id, user_id, ${SCORE_KEYS.join(", ")})
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tutor_id, user_id) DO UPDATE SET ${SCORE_KEYS.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}`,
      [id, req.user.id, ...vals]
    );
  });
  res.status(204).end();
});

// Tutors with lessons can't be deleted (it would erase pay history): mark Finished instead.
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id, "tutor id");
  const used = await query(
    "SELECT (SELECT COUNT(*) FROM lessons WHERE tutor_id = $1) + (SELECT COUNT(*) FROM finance_entries WHERE tutor_id = $1) AS n",
    [id]
  );
  if (Number(used.rows[0].n) > 0) throw conflict("This tutor has lessons or payouts logged. Set their status to Finished instead of deleting.");
  const { rowCount } = await query("DELETE FROM tutors WHERE id = $1", [id]);
  if (!rowCount) throw notFound("Tutor not found");
  res.status(204).end();
});

export default router;
