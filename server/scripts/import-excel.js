// One-time import of the Alga Excel workbook (Tutors, Students, Lessons, Finance).
//   npm run import:excel -- path/to/workbook.xlsx            (really imports)
//   npm run import:excel -- path/to/workbook.xlsx --dry-run  (shows the result, saves nothing)
// Needs founder accounts whose names start with "Almaz" and "Alikhan" (npm run create-user).
import "dotenv/config";
import ExcelJS from "exceljs";
import { pool, withTransaction } from "../src/db.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
if (!file) {
  console.error("Usage: npm run import:excel -- path/to/workbook.xlsx [--dry-run]");
  process.exit(1);
}

const warnings = [];
const warn = (m) => warnings.push(m);

// ---- cell readers -------------------------------------------------------
function raw(cell) {
  let v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) v = v.result;              // formula cell: use the saved result
    else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text;
  }
  return v ?? null;
}
const text = (c) => { const v = raw(c); if (v == null) return null; const s = String(v).trim(); return s || null; };
const num = (c) => { const v = raw(c); if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const yes = (c) => /^(yes|true|1)$/i.test(String(raw(c) ?? "").trim());
const yesNo = (c) => { const s = text(c); return s == null ? null : /^yes$/i.test(s); };
const cents = (c) => { const n = num(c); return n == null ? null : Math.round(n * 100); };

function date(c) {
  const v = raw(c);
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function time(c) {
  const v = raw(c);
  if (v == null || v === "") return null;
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof v === "number") { const mins = Math.round(v * 1440); return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`; }
  const m = String(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// Real data starts at row 5 (row 3 is the grey example row, row 4 the header).
function* dataRows(ws) {
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.cellCount && row.values.some((v) => v != null && v !== "")) yield { row, n: r };
  }
}

const STATUS_FIX = { "Student cancelled ≥24h": "Student cancelled >=24h" };

// ---- main ---------------------------------------------------------------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet = (name) => {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`The workbook has no "${name}" sheet`);
  return ws;
};

const summary = await withTransaction(async (c) => {
  const busy = (await c.query("SELECT (SELECT COUNT(*) FROM lessons) + (SELECT COUNT(*) FROM finance_entries) AS n")).rows[0].n;
  if (busy > 0) throw new Error("The app already has lessons or finance entries. This import is for an empty app only.");

  const users = (await c.query("SELECT id, full_name FROM users WHERE active AND role = 'admin'")).rows;
  const founder = (first) => users.find((u) => u.full_name.trim().toLowerCase().startsWith(first.toLowerCase()))?.id;
  const almaz = founder("Almaz"), alikhan = founder("Alikhan");
  if (!almaz || !alikhan) {
    throw new Error('Create two founder accounts first, with full names starting "Almaz" and "Alikhan" (Team page, or npm run create-user).');
  }
  const who = (c0) => { const s = (text(c0) || "").toLowerCase(); return s.startsWith("almaz") ? almaz : s.startsWith("alikhan") ? alikhan : null; };

  // Tutors
  const tutorIds = new Map(); // lowercased name -> id
  for (const t of (await c.query("SELECT id, name FROM tutors")).rows) tutorIds.set(t.name.toLowerCase(), t.id);
  let tutorsAdded = 0;
  for (const { row, n } of dataRows(sheet("Tutors"))) {
    const name = text(row.getCell(1));
    if (!name) continue;
    if (tutorIds.has(name.toLowerCase())) { warn(`Tutors row ${n}: "${name}" already exists, skipped`); continue; }
    const status = text(row.getCell(30));
    const { rows } = await c.query(
      `INSERT INTO tutors (name, contact, subject, major, year_of_study, grade, lecturer, own_exam_dates, availability,
                           trial_date, hard_filters, rules_signed, agreed_rate_cents, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [name, text(row.getCell(2)), text(row.getCell(3)), text(row.getCell(4)), text(row.getCell(5)), text(row.getCell(6)),
       text(row.getCell(7)), text(row.getCell(8)), text(row.getCell(9)), date(row.getCell(10)), yesNo(row.getCell(23)),
       yes(row.getCell(24)), cents(row.getCell(26)), ["Candidate", "Active", "On hold", "Finished"].includes(status) ? status : "Candidate",
       text(row.getCell(29))]
    );
    tutorIds.set(name.toLowerCase(), rows[0].id);
    tutorsAdded++;
    for (const [uid, first] of [[alikhan, 11], [almaz, 16]]) {
      const v = [0, 1, 2, 3, 4].map((i) => num(row.getCell(first + i)));
      if (v.some((x) => x != null)) {
        await c.query(
          `INSERT INTO tutor_scores (tutor_id, user_id, explanation, exam_knowledge, contact, responsibility, availability)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [rows[0].id, uid, ...v]);
      }
    }
  }
  const tutorId = (name, where) => {
    if (!name) return null;
    const id = tutorIds.get(name.toLowerCase());
    if (!id) warn(`${where}: tutor "${name}" is not in the Tutors sheet`);
    return id ?? null;
  };

  // Students
  const studentIds = new Map();
  for (const s of (await c.query("SELECT id, full_name FROM students")).rows) studentIds.set(s.full_name.toLowerCase(), s.id);
  let studentsAdded = 0;
  for (const { row, n } of dataRows(sheet("Students"))) {
    const name = text(row.getCell(2));
    if (!name) continue;
    if (studentIds.has(name.toLowerCase())) { warn(`Students row ${n}: "${name}" already exists, skipped`); continue; }
    const partner = text(row.getCell(7));
    const notes = [text(row.getCell(18)), partner ? `Duo partner: ${partner}` : null].filter(Boolean).join("\n") || null;
    const status = text(row.getCell(14));
    const rating = num(row.getCell(16));
    const { rows } = await c.query(
      `INSERT INTO students (full_name, mobile, subject, product, tutor_id, group_code, lessons_paid, status, rating, ok_to_publish, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Excel import') RETURNING id`,
      [name, text(row.getCell(3)), text(row.getCell(4)), text(row.getCell(5)), tutorId(text(row.getCell(6)), `Students row ${n}`),
       text(row.getCell(12)), Math.max(0, Math.round(num(row.getCell(10)) ?? 0)),
       ["Active", "Finished", "Left with partial refund", "100% refund"].includes(status) ? status : "Active",
       rating >= 1 && rating <= 5 ? rating : null, yes(row.getCell(17)), notes]
    );
    studentIds.set(name.toLowerCase(), rows[0].id);
    studentsAdded++;
  }

  // Lessons
  let lessonsAdded = 0;
  for (const { row, n } of dataRows(sheet("Lessons"))) {
    const d = date(row.getCell(1)), format = text(row.getCell(5));
    if (!format && !d) continue;
    if (!d || !format) { warn(`Lessons row ${n}: needs a date and a format, skipped`); continue; }
    const status = STATUS_FIX[text(row.getCell(10))] ?? text(row.getCell(10)) ?? "Scheduled";
    const { rows } = await c.query(
      `INSERT INTO lessons (lesson_date, lesson_time, subject, tutor_id, format, group_code, status, logged_same_day, recording_saved, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [d, time(row.getCell(2)), text(row.getCell(3)), tutorId(text(row.getCell(4)), `Lessons row ${n}`), format,
       text(row.getCell(6)), status, yes(row.getCell(11)), yes(row.getCell(15)), text(row.getCell(16))]
    );
    lessonsAdded++;
    const ids = new Set();
    for (const col of [7, 8]) {
      const sn = text(row.getCell(col));
      if (!sn) continue;
      const id = studentIds.get(sn.toLowerCase());
      if (id) ids.add(id); else warn(`Lessons row ${n}: student "${sn}" is not in the Students sheet, not linked`);
    }
    for (const id of ids) await c.query("INSERT INTO lesson_students VALUES ($1,$2)", [rows[0].id, id]);
  }

  // Finance
  let financeAdded = 0;
  for (const { row, n } of dataRows(sheet("Finance"))) {
    const d = date(row.getCell(1)), type = text(row.getCell(2)), amount = cents(row.getCell(5));
    if (!d && !type && amount == null) continue;
    const handled = who(row.getCell(7));
    if (!d || !type || !amount || !handled) { warn(`Finance row ${n}: needs date, type, amount and Almaz/Alikhan, skipped`); continue; }
    const party = text(row.getCell(3));
    const sid = ["Student payment", "Student refund"].includes(type) && party ? studentIds.get(party.toLowerCase()) ?? null : null;
    const tid = type === "Tutor payout" && party ? tutorIds.get(party.toLowerCase()) ?? null : null;
    if (party && ["Student payment", "Student refund"].includes(type) && !sid) warn(`Finance row ${n}: "${party}" is not in Students, kept as plain text`);
    if (party && type === "Tutor payout" && !tid) warn(`Finance row ${n}: "${party}" is not in Tutors, kept as plain text`);
    await c.query(
      `INSERT INTO finance_entries (entry_date, type, student_id, tutor_id, party, purpose, amount_cents, method, handled_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d, type, sid, tid, party, text(row.getCell(4)), amount,
       { transfer: "Transfer", "e-wallet": "E-wallet", cash: "Cash" }[(text(row.getCell(6)) || "").toLowerCase()] ?? null, handled, text(row.getCell(8))]
    );
    financeAdded++;
  }

  const t = (await c.query(
    `SELECT (SELECT COALESCE(SUM(amount_cents),0) FROM finance_entries WHERE type='Student payment') AS payments,
            (SELECT COALESCE(SUM(amount_cents),0) FROM finance_entries WHERE type='Tutor payout') AS payouts,
            (SELECT COALESCE(SUM(revenue_cents),0) FROM lesson_calc) AS revenue,
            (SELECT COALESCE(SUM(tutor_cents),0) FROM lesson_calc) AS tutor`
  )).rows[0];
  if (dryRun) await c.query("ROLLBACK").then(() => c.query("BEGIN"));
  return { tutorsAdded, studentsAdded, lessonsAdded, financeAdded, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)])) };
});

const RM = (x) => (x / 100).toFixed(2);
console.log(dryRun ? "DRY RUN: nothing was saved.\n" : "Import finished.\n");
console.log(`Tutors ${summary.tutorsAdded}, students ${summary.studentsAdded}, lessons ${summary.lessonsAdded}, finance entries ${summary.financeAdded}`);
console.log("\nCompare these with your Excel (Summary / Settlement sheets):");
console.log(`  Student payments (RM):        ${RM(summary.payments)}`);
console.log(`  Tutor payouts (RM):           ${RM(summary.payouts)}`);
console.log(`  Revenue from lessons (RM):    ${RM(summary.revenue)}`);
console.log(`  Tutor pay accrued (RM):       ${RM(summary.tutor)}`);
console.log(`  Margin (RM):                  ${RM(summary.revenue - summary.tutor)}`);
console.log(`  Prepayment (RM):              ${RM(summary.payments - summary.revenue)}`);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n` + warnings.map((w) => "  - " + w).join("\n"));
await pool.end();
