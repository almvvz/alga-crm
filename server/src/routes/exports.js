import { Router } from "express";
import { query } from "../db.js";
import { requireAdmin } from "../auth.js";
import { rm, toCsv } from "../csv.js";
import { STUDENT_SELECT } from "./students.js";

const router = Router();
router.use(requireAdmin);

const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
function send(res, name, csv) {
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send(csv);
}

router.get("/students.csv", async (req, res) => {
  const { rows } = await query(`${STUDENT_SELECT} ORDER BY v.id`);
  send(res, "alga-students", toCsv(
    [
      { label: "ID", key: "code" }, { label: "Name", key: "full_name" }, { label: "Contact", key: "mobile" },
      { label: "Subject", key: "subject" }, { label: "Product", key: "product" }, { label: "Tutor", key: "tutor_name" },
      { label: "Group / code", key: "group_code" }, { label: "Paid (RM)", get: (r) => rm(r.paid_cents) },
      { label: "Refund (RM)", get: (r) => rm(r.refund_cents) }, { label: "Lessons paid", key: "lessons_paid" },
      { label: "Held", key: "lessons_held" }, { label: "Remaining", key: "lessons_remaining" },
      { label: "Status", key: "status" }, { label: "Rating", key: "rating" }, { label: "Notes", key: "notes" },
    ],
    rows
  ));
});

router.get("/lessons.csv", async (req, res) => {
  const { rows } = await query(
    `SELECT l.*, t.name AS tutor_name,
            COALESCE((SELECT string_agg(s.full_name, '; ' ORDER BY s.full_name) FROM lesson_students ls
                        JOIN students s ON s.id = ls.student_id WHERE ls.lesson_id = l.id), '') AS student_names
       FROM lesson_calc l LEFT JOIN tutors t ON t.id = l.tutor_id ORDER BY l.lesson_date, l.lesson_time NULLS LAST, l.id`
  );
  send(res, "alga-lessons", toCsv(
    [
      { label: "Date", get: (r) => day(r.lesson_date) }, { label: "Time", get: (r) => r.lesson_time?.slice(0, 5) },
      { label: "Subject", key: "subject" }, { label: "Tutor", key: "tutor_name" }, { label: "Format", key: "format" },
      { label: "Group / code", key: "group_code" }, { label: "Students", key: "student_names" }, { label: "Status", key: "status" },
      { label: "Revenue (RM)", get: (r) => rm(r.revenue_cents) }, { label: "To tutor (RM)", get: (r) => rm(r.tutor_cents) },
      { label: "Margin (RM)", get: (r) => rm(Number(r.revenue_cents) - Number(r.tutor_cents)) }, { label: "Notes", key: "notes" },
    ],
    rows
  ));
});

router.get("/finance.csv", async (req, res) => {
  const { rows } = await query(
    `SELECT f.*, COALESCE(s.full_name, t.name, f.party) AS who, u.full_name AS handled_by_name
       FROM finance_entries f JOIN users u ON u.id = f.handled_by
       LEFT JOIN students s ON s.id = f.student_id LEFT JOIN tutors t ON t.id = f.tutor_id
      ORDER BY f.entry_date, f.id`
  );
  send(res, "alga-finance", toCsv(
    [
      { label: "Date", get: (r) => day(r.entry_date) }, { label: "Type", key: "type" }, { label: "From / to", key: "who" },
      { label: "For what", key: "purpose" }, { label: "Amount (RM)", get: (r) => rm(r.amount_cents) },
      { label: "Method", key: "method" }, { label: "Who received / sent", key: "handled_by_name" }, { label: "Note", key: "note" },
    ],
    rows
  ));
});

export default router;
