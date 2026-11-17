import { useState } from "react";
import { api } from "../api.js";
import { ENTRY_TYPES, FORMATS, LESSON_STATUSES, MAX_STUDENTS, METHODS, PRODUCTS, STUDENT_STATUSES } from "../constants.js";
import { fromCents, today, toCents } from "../utils.js";
import { useAuth } from "../auth.jsx";
import Modal from "./Modal.jsx";
import { Button, ErrorBox, Field, inputCls, useAction, useLoad } from "./ui.jsx";

const Actions = ({ busy, onClose, label = "Save", extra }) => (
  <div className="flex items-center justify-between gap-2 pt-2">
    <div>{extra}</div>
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : label}</Button>
    </div>
  </div>
);
const Check = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-sm text-slate-700">
    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);
const Select = ({ value, onChange, children, ...p }) => (
  <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p}>{children}</select>
);

// ---------------------------------------------------------------- student
export function StudentForm({ student, tutors, onSaved, onClose }) {
  const [f, setF] = useState({
    full_name: student?.full_name ?? "", mobile: student?.mobile ?? "", subject: student?.subject ?? "",
    product: student?.product ?? "", tutor_id: student?.tutor_id ?? "", group_code: student?.group_code ?? "",
    lessons_paid: student?.lessons_paid ?? 0, status: student?.status ?? "Active", rating: student?.rating ?? "",
    source: student?.source ?? "", ok_to_publish: student?.ok_to_publish ?? false, notes: student?.notes ?? "",
    programme: student?.programme ?? "", year: student?.year ?? "",
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, run } = useAction();

  async function submit(e) {
    e.preventDefault();
    const saved = await run(() => (student ? api.students.update(student.id, f) : api.students.create(f)));
    if (saved) onSaved(saved);
  }
  return (
    <Modal title={student ? "Edit student" : "New student"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="Name *" hint="Must be unique: lessons are matched by student.">
          <input className={inputCls} required autoFocus value={f.full_name} onChange={(e) => set("full_name")(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact"><input className={inputCls} value={f.mobile} onChange={(e) => set("mobile")(e.target.value)} /></Field>
          <Field label="Subject"><input className={inputCls} value={f.subject} onChange={(e) => set("subject")(e.target.value)} /></Field>
          <Field label="Product">
            <Select value={f.product} onChange={set("product")}><option value="">—</option>{PRODUCTS.map((p) => <option key={p}>{p}</option>)}</Select>
          </Field>
          <Field label="Tutor">
            <Select value={f.tutor_id} onChange={set("tutor_id")}><option value="">—</option>{tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </Field>
          <Field label="Group / code" hint="e.g. INT-1 or DUO-1"><input className={inputCls} value={f.group_code} onChange={(e) => set("group_code")(e.target.value)} /></Field>
          <Field label="Lessons paid"><input className={inputCls} type="number" min="0" value={f.lessons_paid} onChange={(e) => set("lessons_paid")(e.target.value)} /></Field>
          <Field label="Status"><Select value={f.status} onChange={set("status")}>{STUDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Lesson rating (1–5)"><input className={inputCls} type="number" min="1" max="5" value={f.rating} onChange={(e) => set("rating")(e.target.value)} /></Field>
          <Field label="Source"><input className={inputCls} value={f.source} onChange={(e) => set("source")(e.target.value)} /></Field>
          <Field label="Course / year"><input className={inputCls} value={f.programme} onChange={(e) => set("programme")(e.target.value)} /></Field>
        </div>
        <Check label="OK to publish their review" checked={f.ok_to_publish} onChange={set("ok_to_publish")} />
        <Field label="Notes"><textarea className={inputCls} rows={3} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------- lesson
export function LessonForm({ lesson, defaults = {}, tutors, students, onSaved, onClose, onDelete }) {
  const [f, setF] = useState({
    lesson_date: lesson?.lesson_date ?? defaults.lesson_date ?? today(),
    lesson_time: lesson?.lesson_time?.slice(0, 5) ?? "",
    subject: lesson?.subject ?? defaults.subject ?? "",
    tutor_id: lesson?.tutor_id ?? defaults.tutor_id ?? "",
    format: lesson?.format ?? defaults.format ?? "1-on-1 single",
    group_code: lesson?.group_code ?? defaults.group_code ?? "",
    status: lesson?.status ?? defaults.status ?? "Held",
    student_ids: lesson?.students?.map((s) => s.id) ?? defaults.student_ids ?? [],
    logged_same_day: lesson?.logged_same_day ?? true,
    recording_saved: lesson?.recording_saved ?? false,
    notes: lesson?.notes ?? "",
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, setError, run } = useAction();
  const max = MAX_STUDENTS[f.format] ?? 0;
  const byId = new Map(students.map((s) => [s.id, s]));
  const chosen = f.student_ids.map((id) => byId.get(id)).filter(Boolean);

  function addStudent(idText) {
    if (!idText) return;
    const id = Number(idText);
    const s = byId.get(id);
    setF((x) => ({
      ...x,
      student_ids: x.student_ids.includes(id) ? x.student_ids : [...x.student_ids, id],
      // Save typing: borrow subject / tutor / group from the student if still empty.
      subject: x.subject || s?.subject || "",
      tutor_id: x.tutor_id || s?.tutor_id || "",
      group_code: x.group_code || (x.format === "Duo" ? s?.group_code || "" : ""),
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (max && f.student_ids.length > max) return setError(`${f.format} lessons take at most ${max} student(s)`);
    const body = { ...f, student_ids: f.format === "Intensive" ? [] : f.student_ids };
    const saved = await run(() => (lesson ? api.lessons.update(lesson.id, body) : api.lessons.create(body)));
    if (saved) onSaved(saved);
  }

  return (
    <Modal title={lesson ? "Edit lesson" : "Log a lesson"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date *"><input className={inputCls} type="date" required value={f.lesson_date} onChange={(e) => set("lesson_date")(e.target.value)} /></Field>
          <Field label="Time"><input className={inputCls} type="time" value={f.lesson_time} onChange={(e) => set("lesson_time")(e.target.value)} /></Field>
          <Field label="Format *">
            <Select value={f.format} onChange={set("format")}>{FORMATS.map((x) => <option key={x}>{x}</option>)}</Select>
          </Field>
          <Field label="Status *">
            <Select value={f.status} onChange={set("status")}>{LESSON_STATUSES.map((x) => <option key={x}>{x}</option>)}</Select>
          </Field>
        </div>

        {f.format === "Intensive" ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Intensive lessons are tracked by group code (money for intensives isn’t counted per lesson). Use the same code on each student.
          </p>
        ) : (
          <Field label={max ? `Student${max > 1 ? "s" : ""} (max ${max})` : "Students"}>
            <div className="space-y-2">
              {chosen.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {chosen.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">
                      {s.full_name}
                      <button type="button" aria-label={`Remove ${s.full_name}`} onClick={() => set("student_ids")(f.student_ids.filter((i) => i !== s.id))} className="text-indigo-500 hover:text-indigo-900">×</button>
                    </span>
                  ))}
                </div>
              )}
              <select className={inputCls} value="" onChange={(e) => addStudent(e.target.value)}>
                <option value="">Add a student…</option>
                {students.filter((s) => !f.student_ids.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tutor">
            <Select value={f.tutor_id} onChange={set("tutor_id")}><option value="">—</option>{tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </Field>
          <Field label="Subject"><input className={inputCls} value={f.subject} onChange={(e) => set("subject")(e.target.value)} /></Field>
          <Field label="Group / code"><input className={inputCls} value={f.group_code} onChange={(e) => set("group_code")(e.target.value)} placeholder="INT-1, DUO-1…" /></Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check label="Logged the same day" checked={f.logged_same_day} onChange={set("logged_same_day")} />
          <Check label="Recording saved" checked={f.recording_saved} onChange={set("recording_saved")} />
        </div>
        <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        <Actions busy={busy} onClose={onClose} extra={lesson && onDelete && <Button variant="danger" onClick={() => onDelete(lesson)}>Delete</Button>} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- finance
export function EntryForm({ entry, defaults = {}, tutors, students, onSaved, onClose, onDelete }) {
  const { user } = useAuth();
  const founders = useLoad(() => api.users.list(), []);
  const [f, setF] = useState({
    entry_date: entry?.entry_date ?? today(),
    type: entry?.type ?? defaults.type ?? "Student payment",
    student_id: entry?.student_id ?? defaults.student_id ?? "",
    tutor_id: entry?.tutor_id ?? defaults.tutor_id ?? "",
    party: entry?.student_id || entry?.tutor_id ? "" : entry?.party ?? "",
    purpose: entry?.purpose ?? defaults.purpose ?? "",
    amount: entry ? fromCents(entry.amount_cents) : defaults.amount ?? "",
    method: entry?.method ?? defaults.method ?? "",
    handled_by: entry?.handled_by ?? user.id,
    note: entry?.note ?? "",
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, setError, run } = useAction();
  const isStudent = f.type === "Student payment" || f.type === "Student refund";
  const isTutor = f.type === "Tutor payout";
  const people = (founders.data ?? []).filter((u) => u.active || u.id === f.handled_by);
  const who = { "Student payment": "Who received it *", "Student refund": "Who sent it *", "Tutor payout": "Who sent it *", Expense: "Who paid *", "Other income": "Who received it *", "Partner transfer": "Who sent it *" }[f.type];

  async function submit(e) {
    e.preventDefault();
    const cents = toCents(f.amount);
    if (!cents) return setError("Enter the amount in RM, like 40 or 12.50");
    const body = {
      ...f, amount_cents: cents,
      student_id: isStudent ? f.student_id : "", tutor_id: isTutor ? f.tutor_id : "",
      party: isStudent && f.student_id || isTutor && f.tutor_id ? "" : f.party,
    };
    const saved = await run(() => (entry ? api.finance.update(entry.id, body) : api.finance.create(body)));
    if (saved) onSaved(saved);
  }

  return (
    <Modal title={entry ? "Edit entry" : "New finance entry"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date *"><input className={inputCls} type="date" required value={f.entry_date} onChange={(e) => set("entry_date")(e.target.value)} /></Field>
          <Field label="Type *"><Select value={f.type} onChange={set("type")}>{ENTRY_TYPES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </div>
        {isStudent && (
          <Field label="Student *">
            <Select value={f.student_id} onChange={set("student_id")} required>
              <option value="">Pick a student…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          </Field>
        )}
        {isTutor && (
          <Field label="Tutor *">
            <Select value={f.tutor_id} onChange={set("tutor_id")} required>
              <option value="">Pick a tutor…</option>
              {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        {!isStudent && !isTutor && f.type !== "Partner transfer" && (
          <Field label="From / to"><input className={inputCls} value={f.party} onChange={(e) => set("party")(e.target.value)} /></Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (RM) *" hint={isTutor ? "Enter the amount actually sent (after penalties)." : undefined}>
            <input className={inputCls} inputMode="decimal" required placeholder="40" value={f.amount} onChange={(e) => set("amount")(e.target.value)} />
          </Field>
          <Field label="Method">
            <Select value={f.method} onChange={set("method")}><option value="">—</option>{METHODS.map((x) => <option key={x}>{x}</option>)}</Select>
          </Field>
          <Field label={who}>
            <Select value={f.handled_by} onChange={(v) => set("handled_by")(Number(v))} required>
              {people.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </Select>
          </Field>
          <Field label="For what"><input className={inputCls} value={f.purpose} onChange={(e) => set("purpose")(e.target.value)} placeholder="e.g. pack of 4 lessons" /></Field>
        </div>
        <Field label="Note"><textarea className={inputCls} rows={2} value={f.note} onChange={(e) => set("note")(e.target.value)} /></Field>
        <Actions busy={busy} onClose={onClose} extra={entry && onDelete && <Button variant="danger" onClick={() => onDelete(entry)}>Delete</Button>} />
      </form>
    </Modal>
  );
}
