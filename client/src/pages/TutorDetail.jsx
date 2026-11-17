import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { EntryForm } from "../components/forms.jsx";
import { TutorForm } from "../components/tutorForm.jsx";
import { Badge, Button, Card, ErrorBox, Loading, Money, PageHeader, Stat, inputCls, useAction, useLoad } from "../components/ui.jsx";
import { useLookups } from "../lookups.js";
import { fromCents, formatDate } from "../utils.js";
import { decisionTone } from "./Tutors.jsx";

const CRITERIA = [["explanation", "Explanation"], ["exam_knowledge", "Exam knowledge"], ["contact", "Contact"], ["responsibility", "Responsibility"], ["availability", "Availability"]];
const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-900">{children || "—"}</dd></div>
);

function ScoreBox({ tutor, onSaved }) {
  const [v, setV] = useState(Object.fromEntries(CRITERIA.map(([k]) => [k, tutor.my_scores?.[k] ?? ""])));
  const { busy, error, run } = useAction();
  async function save(e) {
    e.preventDefault();
    const ok = await run(async () => { await api.tutors.saveScores(tutor.id, v); return true; });
    if (ok) onSaved();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-sm text-slate-600">Score 1–5 after the trial lesson. You see the other founders’ scores only after you submit yours.</p>
      <ErrorBox message={error} />
      <div className="grid gap-3 sm:grid-cols-5">
        {CRITERIA.map(([k, label]) => (
          <label key={k} className="text-xs text-slate-500">{label}
            <select className={inputCls} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}>
              <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : tutor.my_scores ? "Update my scores" : "Submit my scores"}</Button>
    </form>
  );
}

export default function TutorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: t, error, loading, reload } = useLoad(() => api.tutors.get(id), [id]);
  const { tutors, students, ready } = useLookups();
  const [modal, setModal] = useState(null);
  const del = useAction();

  async function remove() {
    if (!confirm(`Delete ${t.name}?`)) return;
    const ok = await del.run(async () => { await api.tutors.remove(t.id); return true; });
    if (ok) navigate("/tutors");
  }
  const done = () => { setModal(null); reload(); };

  if (loading && !t) return <Loading />;
  if (!t) return <div><ErrorBox message={error || "Tutor not found"} /><Link to="/tutors" className="mt-4 inline-block text-sm text-indigo-600">← Back to tutors</Link></div>;

  return (
    <div>
      <Link to="/tutors" className="text-sm text-slate-500 hover:text-slate-800">← Tutors</Link>
      <PageHeader title={t.name} subtitle={t.subject ?? undefined}>
        <Button variant="secondary" disabled={!ready} onClick={() => setModal("payout")}>Record payout</Button>
        <Button variant="secondary" onClick={() => setModal("edit")}>Edit</Button>
        <Button variant="danger" onClick={remove} disabled={del.busy}>Delete</Button>
      </PageHeader>
      <ErrorBox message={del.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lessons held" value={t.lessons_held} />
        <Stat label="Earned" value={<Money cents={t.earned_cents} />} />
        <Stat label="Paid out" value={<Money cents={t.paid_cents} />} />
        <Stat label="Owed now" value={<Money cents={t.owed_cents} />} tone={t.owed_cents > 0 ? "bad" : undefined} hint={t.owed_cents < 0 ? "Paid ahead of lessons held" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Profile">
          <dl className="divide-y divide-slate-100">
            <Row label="Status"><Badge tone={t.status === "Active" ? "green" : "slate"}>{t.status}</Badge></Row>
            <Row label="Contact">{t.contact}</Row><Row label="Major">{t.major}</Row><Row label="Year of study">{t.year_of_study}</Row>
            <Row label="Grade">{t.grade}</Row><Row label="Lecturer">{t.lecturer}</Row><Row label="Own exams">{t.own_exam_dates}</Row>
            <Row label="Availability">{t.availability}</Row><Row label="Trial lesson">{t.trial_date ? formatDate(t.trial_date) : null}</Row>
            <Row label="Hard filters">{t.hard_filters == null ? null : t.hard_filters ? "Passed" : "Failed"}</Row>
            <Row label="Rules signed">{t.rules_signed ? "Yes" : "No"}</Row>
            <Row label="Agreed rate">{t.agreed_rate_cents != null ? `RM ${fromCents(t.agreed_rate_cents)}` : null}</Row>
          </dl>
          {t.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{t.notes}</p>}
        </Card>
        <Card title="Trial lesson scores" className="lg:col-span-2"
          action={t.decision ? <span className="flex items-center gap-2 text-sm"><span className="tabular-nums text-slate-600">avg {t.average}</span><Badge tone={decisionTone(t.decision)}>{t.decision}</Badge></span> : null}>
          <ScoreBox key={t.my_scores ? "has" : "none"} tutor={t} onSaved={reload} />
          {t.hidden_scores > 0 && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.hidden_scores} other founder{t.hidden_scores > 1 ? "s have" : " has"} already scored. Submit yours to see theirs.</p>}
          {t.scores.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <thead><tr><th className="py-1 text-xs font-semibold uppercase text-slate-500">Founder</th>{CRITERIA.map(([k, l]) => <th key={k} className="py-1 text-xs font-semibold uppercase text-slate-500">{l}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{t.scores.map((s) => (
                <tr key={s.user_id}><td className="py-1.5 font-medium">{s.user_name}</td>{CRITERIA.map(([k]) => <td key={k} className="py-1.5 tabular-nums">{s[k] ?? "—"}</td>)}</tr>
              ))}</tbody>
            </table>
          )}
          <p className="mt-4 text-xs text-slate-500">Rule: hire if hard filters passed, the average is 4.0 or more, and nobody gave 2 or less for explanation or contact.</p>
        </Card>
      </div>
      {modal === "edit" && <TutorForm tutor={t} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "payout" && <EntryForm tutors={tutors} students={students} defaults={{ type: "Tutor payout", tutor_id: t.id, amount: t.owed_cents > 0 ? fromCents(t.owed_cents) : "", purpose: "Tutor payout" }} onClose={() => setModal(null)} onSaved={done} />}
    </div>
  );
}
