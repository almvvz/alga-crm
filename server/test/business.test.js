import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { client, makeUser, resetDb, startServer, pool } from "./helpers.js";

let srv, c, almaz, alikhan;
before(async () => {
  await resetDb();
  almaz = await makeUser("almaz@alga.test", "Almaz Tleubay");
  alikhan = await makeUser("alikhan@alga.test", "Alikhan Test");
  srv = await startServer();
  c = client(srv.base);
  await c.login("almaz@alga.test");
});
after(async () => {
  await srv.close();
  await pool.end();
});

const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

test("students: create, unique names, validation, delete rules", async () => {
  const tutor = ok(await c.post("/api/tutors", { name: "Tsetsen Z", status: "Active" }), 201);
  const s = ok(await c.post("/api/students", { full_name: "Batbuyan B", product: "1-on-1 pack", tutor_id: tutor.id, lessons_paid: 4 }), 201);
  assert.equal(s.code, "S-001");
  assert.equal(s.lessons_remaining, 4);
  assert.equal((await c.post("/api/students", { full_name: "batbuyan b" })).status, 409, "names are unique, case-insensitive");
  assert.equal((await c.post("/api/students", { full_name: "" })).status, 400);
  assert.equal((await c.post("/api/students", { full_name: "Bad", product: "Magic" })).status, 400);
  assert.equal((await c.post("/api/students", { full_name: "Bad", lessons_paid: -1 })).status, 400);
  const q = ok(await c.get("/api/students?q=batbu"));
  assert.equal(q.length, 1);
  assert.equal((await c.get("/api/students/9999")).status, 404);
  assert.equal((await c.get("/api/students/abc")).status, 400);
});

test("lessons: revenue and tutor pay follow the Excel rules", async () => {
  const [{ id: t }] = ok(await c.get("/api/tutors"));
  const a = ok(await c.post("/api/students", { full_name: "Duo One", product: "Duo" }), 201);
  const b = ok(await c.post("/api/students", { full_name: "Duo Two", product: "Duo" }), 201);
  const solo = ok(await c.post("/api/students", { full_name: "Solo Sam", product: "Solo after duo" }), 201);
  const single = ok(await c.post("/api/students", { full_name: "Single Sue", product: "1-on-1 single" }), 201);
  const [pack] = ok(await c.get("/api/students?q=Batbuyan"));

  const mk = async (format, status, ids) =>
    ok(await c.post("/api/lessons", { lesson_date: "2026-11-16", format, status, tutor_id: t, student_ids: ids }), 201);

  const L = {
    single: await mk("1-on-1 single", "Held", [single.id]),
    pack: await mk("1-on-1 pack", "Held", [pack.id]),
    duo: await mk("Duo", "Held", [a.id, b.id]),
    solo: await mk("Solo after duo", "Held", [solo.id]),
    burned: await mk("1-on-1 single", "Student cancelled <24h (lesson burned)", [single.id]),
    noshow: await mk("1-on-1 single", "No-show (rescheduled)", [single.id]),
    cancelled: await mk("1-on-1 single", "Student cancelled >=24h", [single.id]),
    tutorCancel: await mk("1-on-1 single", "Tutor cancelled", [single.id]),
    scheduled: await mk("1-on-1 single", "Scheduled", [single.id]),
    intensive: await mk("Intensive", "Held", []),
  };
  const rev = (l) => [l.revenue_cents, l.tutor_cents];
  assert.deepEqual(rev(L.single), [4000, 2500]);
  assert.deepEqual(rev(L.pack), [3500, 2500]);       // 140 / 4
  assert.deepEqual(rev(L.duo), [5000, 2500]);        // 25 x 2 students
  assert.deepEqual(rev(L.solo), [3500, 2500]);
  assert.deepEqual(rev(L.burned), [4000, 2500]);     // burned lesson is still paid
  assert.deepEqual(rev(L.noshow), [0, 1250]);        // half the tutor rate
  assert.deepEqual(rev(L.cancelled), [0, 0]);
  assert.deepEqual(rev(L.tutorCancel), [0, 0]);
  assert.deepEqual(rev(L.scheduled), [0, 0]);
  assert.deepEqual(rev(L.intensive), [0, 0]);        // intensive money is not per-lesson

  // Held counts lessons held + burned, like the Excel "Held (auto)" column.
  const sue = ok(await c.get(`/api/students/${single.id}`));
  assert.equal(sue.lessons_held, 2);
  assert.equal(sue.lessons.length, 6);
});

test("lessons: input rules", async () => {
  const base = { lesson_date: "2026-11-17", format: "Duo", status: "Held" };
  const s = ok(await c.get("/api/students")).slice(0, 3).map((x) => x.id);
  assert.equal((await c.post("/api/lessons", { ...base, student_ids: s })).status, 400, "duo max 2");
  assert.equal((await c.post("/api/lessons", { ...base, format: "1-on-1 single", student_ids: s.slice(0, 2) })).status, 400);
  assert.equal((await c.post("/api/lessons", { ...base, lesson_date: "2026-13-45" })).status, 400);
  assert.equal((await c.post("/api/lessons", { ...base, lesson_time: "25:99" })).status, 400);
  assert.equal((await c.post("/api/lessons", { ...base, status: "Whatever" })).status, 400);
  assert.equal((await c.post("/api/lessons", { ...base, student_ids: [987654] })).status, 409, "unknown student");
  const L = ok(await c.post("/api/lessons", { ...base, lesson_time: "17:00", student_ids: [s[0]] }), 201);
  const edited = ok(await c.put(`/api/lessons/${L.id}`, { ...base, lesson_time: "18:30", student_ids: [s[0], s[1]] }));
  assert.equal(edited.students.length, 2);
  assert.equal(edited.lesson_time.slice(0, 5), "18:30");
  assert.equal((await c.del(`/api/lessons/${L.id}`)).status, 204);
  assert.equal((await c.get(`/api/lessons/${L.id}`)).status, 404);
});

test("students with lessons can't be deleted; empty ones can", async () => {
  const [withLessons] = ok(await c.get("/api/students?q=Single"));
  assert.equal((await c.del(`/api/students/${withLessons.id}`)).status, 409);
  const e = ok(await c.post("/api/students", { full_name: "Empty E" }), 201);
  assert.equal((await c.del(`/api/students/${e.id}`)).status, 204);
});

test("finance: validation and linking", async () => {
  const [stu] = ok(await c.get("/api/students?q=Single"));
  const [tut] = ok(await c.get("/api/tutors"));
  const base = { entry_date: "2026-11-12", type: "Student payment", student_id: stu.id, amount_cents: 4000, method: "Cash", handled_by: almaz };
  const e = ok(await c.post("/api/finance", base), 201);
  assert.equal(e.who, "Single Sue");
  assert.equal(e.cash_flow_cents, 4000);
  assert.equal((await c.post("/api/finance", { ...base, amount_cents: 0 })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, amount_cents: 12.5 })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, amount_cents: -5 })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, type: "Nonsense" })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, method: "Bitcoin" })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, handled_by: 99999 })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, handled_by: undefined })).status, 400);
  assert.equal((await c.post("/api/finance", { ...base, type: "Expense" })).status, 400, "expenses don't link to a student");
  assert.equal((await c.post("/api/finance", { ...base, type: "Tutor payout", student_id: undefined, tutor_id: tut.id, amount_cents: 2500 })).status, 201);
  const payout = ok(await c.get("/api/finance?type=Tutor payout"));
  assert.equal(payout[0].cash_flow_cents, -2500);
  const edited = ok(await c.put(`/api/finance/${e.id}`, { ...base, amount_cents: 4500 }));
  assert.equal(edited.amount_cents, 4500);
  ok(await c.put(`/api/finance/${e.id}`, base));
  assert.equal((await c.get("/api/finance?from=2026-11-13")).data.length, 0, "date filter");
  assert.equal((await c.post("/api/finance", { ...base, entry_date: "2026-02-31" })).status, 400, "no 31st of February");
});

test("settlement matches the Excel example (payments 320, payouts 125, profit 40, prepayment 205)", async () => {
  // Fresh books so numbers are easy to check by hand.
  await resetDb();
  almaz = await makeUser("almaz@alga.test", "Almaz Tleubay");
  alikhan = await makeUser("alikhan@alga.test", "Alikhan Test");
  c = client(srv.base);
  await c.login("almaz@alga.test");

  const t = ok(await c.post("/api/tutors", { name: "Tutor T", status: "Active" }), 201);
  const bat = ok(await c.post("/api/students", { full_name: "Bat B", product: "1-on-1 pack" }), 201);
  const lesson = (format, id) => c.post("/api/lessons", { lesson_date: "2026-11-16", format, status: "Held", tutor_id: t.id, student_ids: [id] });
  await lesson("1-on-1 single", bat.id);
  await lesson("1-on-1 single", bat.id);
  await lesson("1-on-1 pack", bat.id);
  const pay = (type, amount, by, extra = {}) =>
    c.post("/api/finance", { entry_date: "2026-11-17", type, amount_cents: amount, handled_by: by, ...extra });
  ok(await pay("Student payment", 4000, almaz, { student_id: bat.id }), 201);
  ok(await pay("Student payment", 4000, almaz, { student_id: bat.id }), 201);
  ok(await pay("Student payment", 10000, almaz, { student_id: bat.id }), 201);
  ok(await pay("Student payment", 14000, almaz, { student_id: bat.id }), 201);
  ok(await pay("Tutor payout", 2500, almaz, { tutor_id: t.id }), 201);
  ok(await pay("Tutor payout", 2500, almaz, { tutor_id: t.id }), 201);
  ok(await pay("Tutor payout", 7500, almaz, { tutor_id: t.id }), 201);
  ok(await pay("Partner transfer", 2000, almaz), 201);

  const s = ok(await c.get("/api/settlement"));
  assert.equal(s.revenue_cents, 11500);
  assert.equal(s.tutor_accrued_cents, 7500);
  assert.equal(s.profit_cents, 4000);
  const A = s.partners.find((p) => p.id === almaz), K = s.partners.find((p) => p.id === alikhan);
  assert.equal(A.share_cents, 2000);
  assert.equal(K.share_cents, 2000);
  assert.equal(A.holds_cents, 17500);
  assert.equal(K.holds_cents, 2000);
  assert.equal(K.shortfall_cents, 0);
  assert.equal(s.not_paid_to_tutors_cents, 7500 - 12500);   // -50 RM, as in Excel
  assert.equal(s.prepayment_cents, 32000 - 11500 - 0);       // payments - revenue
  assert.equal(s.tutors[0].owed_cents, -5000);

  const d = ok(await c.get("/api/dashboard"));
  assert.equal(d.money.student_payments_cents, 32000);
  assert.equal(d.money.tutor_payouts_cents, 12500);
  assert.equal(d.money.net_cash_cents, 19500);               // 320 - 125
  assert.equal(d.lessons.margin_cents, 4000);
  assert.equal(d.students.paying, 1);
});

test("partner transfer needs exactly two founders", async () => {
  const third = await makeUser("third@alga.test", "Third Founder");
  const r = await c.post("/api/finance", { entry_date: "2026-11-17", type: "Partner transfer", amount_cents: 100, handled_by: almaz });
  assert.equal(r.status, 400);
  await pool.query("UPDATE users SET active = false WHERE id = $1", [third]);
});

test("pricing settings change the numbers and are validated", async () => {
  const before = ok(await c.get("/api/lessons"));
  const single = before.find((l) => l.format === "1-on-1 single");
  assert.equal(single.revenue_cents, 4000);
  ok(await c.put("/api/settings", { values: { f2f_single: 4500, tutor_rate: 3000 } }));
  const after = ok(await c.get(`/api/lessons/${single.id}`));
  assert.equal(after.revenue_cents, 4500);
  assert.equal(after.tutor_cents, 3000);
  assert.equal((await c.put("/api/settings", { values: { f2f_single: -1 } })).status, 400);
  assert.equal((await c.put("/api/settings", { values: { f2f_single: 10.5 } })).status, 400, "money must be whole sen");
  assert.equal((await c.put("/api/settings", { values: { nope: 1 } })).status, 400);
  assert.equal((await c.put("/api/settings", { values: { pack_lessons: 0 } })).status, 400);
  assert.equal((await c.put("/api/settings", { values: { noshow_share: 2 } })).status, 400);
  assert.equal((await c.put("/api/settings", { values: { f2f_single: 4000, tutor_rate: 2500 } })).status, 200);
});

test("tutors: blind scoring and the hiring rule", async () => {
  const t = ok(await c.post("/api/tutors", { name: "Candidate C", hard_filters: true }), 201);
  const scores = (n) => ({ explanation: n, exam_knowledge: n, contact: n, responsibility: n, availability: n });
  ok(await c.put(`/api/tutors/${t.id}/scores`, scores(5)), 204);

  const mine = ok(await c.get(`/api/tutors/${t.id}`));
  assert.equal(mine.my_scores.explanation, 5);
  assert.equal(mine.decision, "Hire");

  // Alikhan hasn't scored yet; when he logs in he must not see Almaz's scores before submitting his own.
  const k = client(srv.base);
  await k.login("alikhan@alga.test");
  const blind = ok(await k.get(`/api/tutors/${t.id}`));
  assert.equal(blind.scores.length, 0);
  assert.equal(blind.hidden_scores, 1);
  const low = { ...scores(5), contact: 2 };            // 2 or less on "contact" blocks hiring
  ok(await k.put(`/api/tutors/${t.id}/scores`, low), 204);
  const after = ok(await k.get(`/api/tutors/${t.id}`));
  assert.equal(after.scores.length, 2);
  assert.equal(after.decision, "Don't hire");
  assert.ok(after.average > 4);
  assert.equal((await k.put(`/api/tutors/${t.id}/scores`, { ...scores(5), contact: 9 })).status, 400);
  assert.equal((await c.post("/api/tutors", { name: "candidate c" })).status, 409);
});

test("tutors with lessons or payouts can't be deleted", async () => {
  const [t] = ok(await c.get("/api/tutors")).filter((x) => x.name === "Tutor T");
  assert.equal((await c.del(`/api/tutors/${t.id}`)).status, 409);
});

test("CSV export: BOM, header and formula-injection guard", async () => {
  ok(await c.post("/api/students", { full_name: "=HYPERLINK(\"http://evil\")", notes: "line1\nline2, \"quoted\"" }), 201);
  const r = await c.get("/api/export/students.csv");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/csv/);
  assert.equal(r.data.charCodeAt(0), 0xfeff);
  assert.match(r.data, /'=HYPERLINK/);
  assert.match(r.data, /"line1\nline2, ""quoted"""/);
  assert.equal((await c.get("/api/export/finance.csv")).status, 200);
  assert.equal((await c.get("/api/export/lessons.csv")).status, 200);
});
