import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { EntryForm, LessonForm, StudentForm } from "../components/forms.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, PageHeader, Stat, Table, Td, Th, lessonTone, studentTone, useAction, useLoad } from "../components/ui.jsx";
import { useLookups } from "../lookups.js";
import { formatDate, formatTime } from "../utils.js";

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-900">{children || "—"}</dd></div>
);

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: s, error, loading, reload } = useLoad(() => api.students.get(id), [id]);
  const { tutors, students, ready } = useLookups();
  const [modal, setModal] = useState(null);
  const del = useAction();

  async function remove() {
    if (!confirm(`Delete ${s.full_name}? This can't be undone.`)) return;
    const ok = await del.run(async () => { await api.students.remove(s.id); return true; });
    if (ok) navigate("/students");
  }
  const done = () => { setModal(null); reload(); };

  if (loading && !s) return <Loading />;
  if (!s) return <div><ErrorBox message={error || "Student not found"} /><Link to="/students" className="mt-4 inline-block text-sm text-indigo-600">← Back to students</Link></div>;

  return (
    <div>
      <Link to="/students" className="text-sm text-slate-500 hover:text-slate-800">← Students</Link>
      <PageHeader title={s.full_name} subtitle={`${s.code}${s.group_code ? " · " + s.group_code : ""}`}>
        <Button variant="secondary" disabled={!ready} onClick={() => setModal("payment")}>+ Payment</Button>
        <Button variant="secondary" disabled={!ready} onClick={() => setModal("lesson")}>+ Lesson</Button>
        <Button variant="secondary" onClick={() => setModal("edit")}>Edit</Button>
        <Button variant="danger" onClick={remove} disabled={del.busy}>Delete</Button>
      </PageHeader>
      <ErrorBox message={del.error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Paid" value={<Money cents={s.paid_cents} />} hint={s.refund_cents ? <>Refunded <Money cents={s.refund_cents} /></> : undefined} />
        <Stat label="Lessons paid" value={s.lessons_paid} />
        <Stat label="Lessons held" value={s.lessons_held} />
        <Stat label="Remaining" value={s.product === "Intensive" ? "—" : s.lessons_remaining} tone={s.product !== "Intensive" && s.lessons_remaining <= 0 ? "bad" : undefined} hint={s.product !== "Intensive" && s.lessons_remaining <= 1 && s.status === "Active" ? "Time to ask for a renewal" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="divide-y divide-slate-100">
            <Row label="Status"><Badge tone={studentTone(s.status)}>{s.status}</Badge></Row>
            <Row label="Product">{s.product}</Row>
            <Row label="Subject">{s.subject}</Row>
            <Row label="Tutor">{s.tutor_name}</Row>
            <Row label="Contact">{s.mobile}</Row>
            <Row label="Source">{s.source}</Row>
            <Row label="Rating">{s.rating ? `${s.rating} / 5` : null}</Row>
            <Row label="OK to publish review">{s.ok_to_publish ? "Yes" : "No"}</Row>
          </dl>
          {s.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{s.notes}</p>}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card title={`Lessons (${s.lessons.length})`} flush>
            {s.lessons.length === 0 ? <Empty>No lessons logged for this student.</Empty> : (
              <Table>
                <thead><tr><Th>When</Th><Th>Format</Th><Th>Tutor</Th><Th>Status</Th><Th right>Revenue</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {s.lessons.map((l) => (
                    <tr key={l.id}><Td>{formatDate(l.lesson_date)} {formatTime(l.lesson_time)}</Td><Td>{l.format}</Td><Td>{l.tutor_name ?? "—"}</Td>
                      <Td><Badge tone={lessonTone(l.status)}>{l.status.replace(" (lesson burned)", " (burned)")}</Badge></Td><Td right><Money cents={l.revenue_cents} /></Td></tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title={`Payments (${s.payments.length})`} flush>
            {s.payments.length === 0 ? <Empty>No payments recorded.</Empty> : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Type</Th><Th>For</Th><Th>To</Th><Th right>Amount</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {s.payments.map((p) => (
                    <tr key={p.id}><Td>{formatDate(p.entry_date)}</Td><Td>{p.type}</Td><Td>{p.purpose ?? "—"}</Td><Td>{p.handled_by_name}{p.method ? ` · ${p.method}` : ""}</Td><Td right><Money cents={p.amount_cents} /></Td></tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      {modal === "edit" && <StudentForm student={s} tutors={tutors} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "lesson" && <LessonForm tutors={tutors} students={students} defaults={{ student_ids: [s.id], subject: s.subject ?? "", tutor_id: s.tutor_id ?? "", format: s.product ?? "1-on-1 single", group_code: s.group_code ?? "" }} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "payment" && <EntryForm tutors={tutors} students={students} defaults={{ type: "Student payment", student_id: s.id }} onClose={() => setModal(null)} onSaved={done} />}
    </div>
  );
}
