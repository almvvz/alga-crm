import { Router } from "express";
import { query } from "../db.js";
import { requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAdmin);

const sum = (rows, key) => rows.reduce((a, r) => a + Number(r[key]), 0);

// Same rules as the Excel "Settlement" sheet, split equally between the
// active founder accounts.
router.get("/", async (req, res) => {
  const [partnersQ, lessonsQ, moneyQ, tutorsQ] = await Promise.all([
    query("SELECT id, full_name FROM users WHERE active AND role = 'admin' ORDER BY id"),
    query("SELECT COALESCE(SUM(revenue_cents),0)::BIGINT AS revenue, COALESCE(SUM(tutor_cents),0)::BIGINT AS tutor FROM lesson_calc"),
    query(
      `SELECT handled_by, type, SUM(amount_cents)::BIGINT AS total
         FROM finance_entries GROUP BY handled_by, type`
    ),
    query(
      `SELECT t.id, t.name,
              COALESCE((SELECT SUM(tutor_cents) FROM lesson_calc l WHERE l.tutor_id = t.id), 0)::BIGINT AS earned,
              COALESCE((SELECT SUM(amount_cents) FROM finance_entries f WHERE f.tutor_id = t.id AND f.type = 'Tutor payout'), 0)::BIGINT AS paid
         FROM tutors t ORDER BY t.name`
    ),
  ]);

  const partners = partnersQ.rows;
  const revenue = Number(lessonsQ.rows[0].revenue);
  const tutorAccrued = Number(lessonsQ.rows[0].tutor);
  const profit = revenue - tutorAccrued;

  const money = (userId, type) =>
    Number(moneyQ.rows.find((r) => r.handled_by === userId && r.type === type)?.total ?? 0);
  const totalOf = (type) => sum(moneyQ.rows.filter((r) => r.type === type), "total");

  const twoPartners = partners.length === 2;
  const out = partners.map((p, i) => {
    const received = money(p.id, "Student payment");
    const spent = money(p.id, "Tutor payout") + money(p.id, "Student refund") + money(p.id, "Expense");
    const other = partners.find((x) => x.id !== p.id);
    const sent = money(p.id, "Partner transfer");
    const got = twoPartners && other ? money(other.id, "Partner transfer") : 0;
    const holds = received - spent + got - sent;
    const share = Math.round(profit / partners.length);
    return {
      id: p.id, name: p.full_name, share_cents: share, received_cents: received, spent_cents: spent,
      transfers_in_cents: got, transfers_out_cents: sent, holds_cents: holds,
      shortfall_cents: Math.max(0, share - holds),
    };
  });

  const payments = totalOf("Student payment");
  const payouts = totalOf("Tutor payout");
  res.json({
    revenue_cents: revenue,
    tutor_accrued_cents: tutorAccrued,
    profit_cents: profit,
    partners: out,
    not_paid_to_tutors_cents: tutorAccrued - payouts,
    prepayment_cents: payments - revenue,
    tutors: tutorsQ.rows.map((t) => ({ id: t.id, name: t.name, earned_cents: Number(t.earned), paid_cents: Number(t.paid), owed_cents: Number(t.earned) - Number(t.paid) })),
    notes: [
      "Prepayment = student payments minus revenue from held lessons. Intensive money counts here until intensives are tracked (next phase).",
      ...(twoPartners ? [] : ["Settlement expects exactly two active founder accounts."]),
    ],
  });
});

export default router;
