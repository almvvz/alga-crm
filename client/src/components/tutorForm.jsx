import { useState } from "react";
import { api } from "../api.js";
import { TUTOR_STATUSES } from "../constants.js";
import { fromCents, toCents } from "../utils.js";
import Modal from "./Modal.jsx";
import { Button, ErrorBox, Field, inputCls, useAction } from "./ui.jsx";

export function TutorForm({ tutor, onSaved, onClose }) {
  const [f, setF] = useState({
    name: tutor?.name ?? "", contact: tutor?.contact ?? "", subject: tutor?.subject ?? "", major: tutor?.major ?? "",
    year_of_study: tutor?.year_of_study ?? "", grade: tutor?.grade ?? "", lecturer: tutor?.lecturer ?? "",
    own_exam_dates: tutor?.own_exam_dates ?? "", availability: tutor?.availability ?? "",
    trial_date: tutor?.trial_date ?? "", hard_filters: tutor?.hard_filters == null ? "" : tutor.hard_filters ? "yes" : "no",
    rules_signed: tutor?.rules_signed ?? false, agreed_rate: fromCents(tutor?.agreed_rate_cents), status: tutor?.status ?? "Candidate", notes: tutor?.notes ?? "",
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { busy, error, setError, run } = useAction();
  const text = (k, label, props = {}) => <Field label={label}><input className={inputCls} value={f[k]} onChange={set(k)} {...props} /></Field>;

  async function submit(e) {
    e.preventDefault();
    const rate = f.agreed_rate === "" ? null : toCents(f.agreed_rate);
    if (f.agreed_rate !== "" && rate == null) return setError("Agreed rate must be an amount like 25");
    const body = { ...f, hard_filters: f.hard_filters === "" ? null : f.hard_filters === "yes", agreed_rate_cents: rate };
    const saved = await run(() => (tutor ? api.tutors.update(tutor.id, body) : api.tutors.create(body)));
    if (saved) onSaved(saved);
  }
  return (
    <Modal title={tutor ? "Edit tutor" : "New tutor"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        {text("name", "Name *", { required: true, autoFocus: true })}
        <div className="grid gap-3 sm:grid-cols-2">
          {text("contact", "Contact")}{text("subject", "Subject")}{text("major", "Major")}{text("year_of_study", "Year of study")}
          {text("grade", "Grade in the subject")}{text("lecturer", "Lecturer")}{text("own_exam_dates", "Own exam dates")}{text("availability", "Availability")}
          <Field label="Trial lesson date"><input type="date" className={inputCls} value={f.trial_date} onChange={set("trial_date")} /></Field>
          <Field label="Agreed rate (RM)"><input className={inputCls} inputMode="decimal" value={f.agreed_rate} onChange={set("agreed_rate")} /></Field>
          <Field label="Hard filters passed">
            <select className={inputCls} value={f.hard_filters} onChange={set("hard_filters")}><option value="">Not decided</option><option value="yes">Yes</option><option value="no">No</option></select>
          </Field>
          <Field label="Status"><select className={inputCls} value={f.status} onChange={set("status")}>{TUTOR_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4" checked={f.rules_signed} onChange={(e) => setF((x) => ({ ...x, rules_signed: e.target.checked }))} />Rules signed</label>
        <Field label="Notes"><textarea className={inputCls} rows={3} value={f.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}
