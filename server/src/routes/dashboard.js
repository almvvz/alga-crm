import { Router } from "express";
import { query } from "../db.js";
import { requireAdmin } from "../auth.js";
import { CASH_FLOW_SQL } from "./finance.js";

const router = Router();
router.use(requireAdmin);

const TODAY = "(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date";

router.get("/", async (req, res) => {
  const [totals, lessons, month, students, alerts, recentLessons, recentMoney] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE type = 'Student payment'), 0)::BIGINT AS payments,
              COALESCE(SUM(amount_cents) FILTER (WHERE type = 'Other income'), 0)::BIGINT AS other_income,
              COALESCE(SUM(amount_cents) FILTER (WHERE type = 'Student refund'), 0)::BIGINT AS refunds,
              COALESCE(SUM(amount_cents) FILTER (WHERE type = 'Tutor payout'), 0)::BIGINT AS payouts,
              COALESCE(SUM(amount_cents) FILTER (WHERE type = 'Expense'), 0)::BIGINT AS expenses
         FROM finance_entries`
    ),
    query(
      `SELECT COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue, COALESCE(SUM(tutor_cents), 0)::BIGINT AS tutor,
              COUNT(*) FILTER (WHERE status = 'Held')::INT AS held,
              COUNT(*) FILTER (WHERE status = 'Scheduled' AND lesson_date >= ${TODAY})::INT AS upcoming
         FROM lesson_calc`
    ),
    query(
      `SELECT
         (SELECT COALESCE(SUM(amount_cents),0) FROM finance_entries f
           WHERE type = 'Student payment' AND date_trunc('month', entry_date) = date_trunc('month', ${TODAY}))::BIGINT AS collected,
         (SELECT COUNT(*) FROM lesson_calc l
           WHERE status = 'Held' AND date_trunc('month', lesson_date) = date_trunc('month', ${TODAY}))::INT AS held,
         (SELECT COUNT(*) FROM lesson_calc l
           WHERE status = 'Held' AND lesson_date > ${TODAY} - 7 AND lesson_date <= ${TODAY})::INT AS held_7d`
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE paid_cents > 0 AND status <> '100% refund')::INT AS paying,
              COUNT(*) FILTER (WHERE status = 'Active')::INT AS active,
              COUNT(*)::INT AS total
         FROM student_summary`
    ),
    // Students running out of paid lessons: time to ask them to renew.
    query(
      `SELECT id, 'S-' || lpad(id::text, 3, '0') AS code, full_name, product, tutor_name, lessons_paid, lessons_held,
              (lessons_paid - lessons_held) AS lessons_remaining
         FROM student_summary
        WHERE status = 'Active' AND product IS NOT NULL AND product <> 'Intensive' AND (lessons_paid - lessons_held) <= 1
        ORDER BY (lessons_paid - lessons_held), full_name LIMIT 20`
    ),
    query(
      `SELECT l.id, l.lesson_date, l.lesson_time, l.format, l.status, l.subject, t.name AS tutor_name,
              COALESCE((SELECT string_agg(s.full_name, ', ' ORDER BY s.full_name) FROM lesson_students ls
                          JOIN students s ON s.id = ls.student_id WHERE ls.lesson_id = l.id), '') AS student_names
         FROM lessons l LEFT JOIN tutors t ON t.id = l.tutor_id
        ORDER BY l.lesson_date DESC, l.lesson_time DESC NULLS LAST, l.id DESC LIMIT 8`
    ),
    query(
      `SELECT f.id, f.entry_date, f.type, f.amount_cents, ${CASH_FLOW_SQL}::BIGINT AS cash_flow_cents,
              COALESCE(s.full_name, t.name, f.party) AS who
         FROM finance_entries f LEFT JOIN students s ON s.id = f.student_id LEFT JOIN tutors t ON t.id = f.tutor_id
        ORDER BY f.entry_date DESC, f.id DESC LIMIT 8`
    ),
  ]);

  const t = totals.rows[0];
  const l = lessons.rows[0];
  const num = (v) => Number(v);
  res.json({
    money: {
      student_payments_cents: num(t.payments),
      other_income_cents: num(t.other_income),
      refunds_cents: num(t.refunds),
      tutor_payouts_cents: num(t.payouts),
      expenses_cents: num(t.expenses),
      net_cash_cents: num(t.payments) + num(t.other_income) - num(t.refunds) - num(t.payouts) - num(t.expenses),
    },
    lessons: {
      revenue_cents: num(l.revenue),
      tutor_cents: num(l.tutor),
      margin_cents: num(l.revenue) - num(l.tutor),
      held_total: l.held,
      upcoming: l.upcoming,
    },
    month: month.rows[0],
    students: students.rows[0],
    renewals: alerts.rows,
    recent_lessons: recentLessons.rows,
    recent_money: recentMoney.rows,
  });
});

export default router;
