import { Router } from "express";
import { query } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { requireAdmin } from "../auth.js";
import { bodyOf, oneOf, optDate, optInt, optText, parseId, reqCents, reqDate } from "../validate.js";

export const ENTRY_TYPES = ["Student payment", "Student refund", "Tutor payout", "Expense", "Other income", "Partner transfer"];
export const METHODS = ["Transfer", "E-wallet", "Cash"];

// Money in = positive, money out = negative, partner transfers don't change the company's cash.
export const CASH_FLOW_SQL = `CASE WHEN f.type = 'Partner transfer' THEN 0
                                   WHEN f.type IN ('Student payment', 'Other income') THEN f.amount_cents
                                   ELSE -f.amount_cents END`;

const SELECT = `
  SELECT f.*, ${CASH_FLOW_SQL}::BIGINT AS cash_flow_cents,
         COALESCE(s.full_name, t.name, f.party) AS who,
         u.full_name AS handled_by_name
    FROM finance_entries f
    JOIN users u ON u.id = f.handled_by
    LEFT JOIN students s ON s.id = f.student_id
    LEFT JOIN tutors t ON t.id = f.tutor_id`;

async function parseEntry(b, q) {
  const type = oneOf(b.type, ENTRY_TYPES, "Type");
  const student_id = optInt(b.student_id, "Student", { min: 1 });
  const tutor_id = optInt(b.tutor_id, "Tutor", { min: 1 });
  if (student_id && !["Student payment", "Student refund"].includes(type)) throw badRequest("Only student payments and refunds link to a student");
  if (tutor_id && type !== "Tutor payout") throw badRequest("Only tutor payouts link to a tutor");
  const handled_by = optInt(b.handled_by, "Who received / sent", { min: 1 });
  if (!handled_by) throw badRequest("Say who received or sent the money");
  const admin = await q("SELECT 1 FROM users WHERE id = $1 AND active AND role = 'admin'", [handled_by]);
  if (!admin.rowCount) throw badRequest("Who received / sent must be an active founder account");

  let party = optText(b.party, "From / to", 100);
  if (student_id) party = (await q("SELECT full_name FROM students WHERE id = $1", [student_id])).rows[0]?.full_name ?? party;
  if (tutor_id) party = (await q("SELECT name FROM tutors WHERE id = $1", [tutor_id])).rows[0]?.name ?? party;
  if (type === "Student payment" && !party) throw badRequest("Pick the student (or type who paid)");
  if (type === "Partner transfer") {
    const n = (await q("SELECT COUNT(*) AS n FROM users WHERE active AND role = 'admin'")).rows[0].n;
    if (n !== 2) throw badRequest("Partner transfers need exactly two active founder accounts");
  }
  return {
    entry_date: reqDate(b.entry_date, "Date"),
    type, student_id, tutor_id, party,
    purpose: optText(b.purpose, "For what", 200),
    amount_cents: reqCents(b.amount_cents, "Amount"),
    method: b.method ? oneOf(b.method, METHODS, "Method") : null,
    handled_by,
    note: optText(b.note, "Note", 1000),
  };
}
const FIELDS = ["entry_date", "type", "student_id", "tutor_id", "party", "purpose", "amount_cents", "method", "handled_by", "note"];

const router = Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (req.query.from) add("f.entry_date >= ?", optDate(req.query.from, "from"));
  if (req.query.to) add("f.entry_date <= ?", optDate(req.query.to, "to"));
  if (req.query.type) add("f.type = ?", oneOf(req.query.type, ENTRY_TYPES, "type"));
  if (req.query.student_id) add("f.student_id = ?", parseId(req.query.student_id, "student id"));
  if (req.query.tutor_id) add("f.tutor_id = ?", parseId(req.query.tutor_id, "tutor id"));
  if (req.query.handled_by) add("f.handled_by = ?", parseId(req.query.handled_by, "user id"));
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const { rows } = await query(
    `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY f.entry_date DESC, f.id DESC LIMIT ${limit}`,
    params
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const e = await parseEntry(bodyOf(req), query);
  const { rows } = await query(
    `INSERT INTO finance_entries (${FIELDS.join(", ")}, created_by)
     VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(", ")}, $${FIELDS.length + 1}) RETURNING id`,
    [...FIELDS.map((f) => e[f]), req.user.id]
  );
  res.status(201).json((await query(`${SELECT} WHERE f.id = $1`, [rows[0].id])).rows[0]);
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id, "entry id");
  const e = await parseEntry(bodyOf(req), query);
  const { rowCount } = await query(
    `UPDATE finance_entries f SET ${FIELDS.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE f.id = $${FIELDS.length + 1}`,
    [...FIELDS.map((k) => e[k]), id]
  );
  if (!rowCount) throw notFound("Entry not found");
  res.json((await query(`${SELECT} WHERE f.id = $1`, [id])).rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await query("DELETE FROM finance_entries WHERE id = $1", [parseId(req.params.id, "entry id")]);
  if (!rowCount) throw notFound("Entry not found");
  res.status(204).end();
});

export default router;
