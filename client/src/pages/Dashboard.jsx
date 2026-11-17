import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { EntryForm, LessonForm } from "../components/forms.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, PageHeader, Stat, Table, Td, Th, lessonTone, useLoad } from "../components/ui.jsx";
import { useLookups } from "../lookups.js";
import { formatDate, formatTime, rm } from "../utils.js";

export default function Dashboard() {
  const { data: d, error, loading, reload } = useLoad(() => api.dashboard(), []);
  const lookups = useLookups();
  const [modal, setModal] = useState(null); // "lesson" | "payment"

  const done = () => { setModal(null); reload(); lookups.reload(); };

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Where the business stands right now">
        <Button variant="secondary" disabled={!lookups.ready} onClick={() => setModal("payment")}>+ Payment</Button>
        <Button disabled={!lookups.ready} onClick={() => setModal("lesson")}>+ Log lesson</Button>
      </PageHeader>
      <ErrorBox message={error} />
      {loading && !d && <Loading />}
      {d && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net cash" value={rm(d.money.net_cash_cents)} hint="Payments − refunds − payouts − expenses" tone={d.money.net_cash_cents < 0 ? "bad" : "good"} />
            <Stat label="Student payments" value={rm(d.money.student_payments_cents)} hint={`Collected this month: ${rm(d.month.collected)}`} />
            <Stat label="Margin from lessons" value={rm(d.lessons.margin_cents)} hint={`Revenue ${rm(d.lessons.revenue_cents)} − tutors ${rm(d.lessons.tutor_cents)}`} />
            <Stat label="Paying students" value={d.students.paying} hint={`${d.students.active} active · ${d.students.total} total`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Lessons held (7 days)" value={d.month.held_7d} />
            <Stat label="Lessons held (this month)" value={d.month.held} />
            <Stat label="Upcoming lessons" value={d.lessons.upcoming} />
            <Stat label="Tutor payouts" value={rm(d.money.tutor_payouts_cents)} hint={`Expenses ${rm(d.money.expenses_cents)} · refunds ${rm(d.money.refunds_cents)}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Needs a renewal" flush action={<Link to="/students" className="text-xs font-medium text-indigo-600 hover:underline">All students</Link>}>
              {d.renewals.length === 0 ? <Empty>Nobody is running out of lessons.</Empty> : (
                <Table>
                  <thead><tr><Th>Student</Th><Th>Tutor</Th><Th right>Left</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.renewals.map((s) => (
                      <tr key={s.id}>
                        <Td><Link className="font-medium text-indigo-600 hover:underline" to={`/students/${s.id}`}>{s.full_name}</Link></Td>
                        <Td>{s.tutor_name ?? "—"}</Td>
                        <Td right><Badge tone={s.lessons_remaining <= 0 ? "red" : "amber"}>{s.lessons_remaining} of {s.lessons_paid}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card title="Recent lessons" flush action={<Link to="/lessons" className="text-xs font-medium text-indigo-600 hover:underline">All lessons</Link>}>
              {d.recent_lessons.length === 0 ? <Empty>No lessons yet.</Empty> : (
                <Table>
                  <thead><tr><Th>When</Th><Th>Who</Th><Th>Status</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.recent_lessons.map((l) => (
                      <tr key={l.id}>
                        <Td>{formatDate(l.lesson_date)} {formatTime(l.lesson_time)}</Td>
                        <Td className="max-w-48 truncate">{l.student_names || l.format}<span className="text-slate-400"> · {l.tutor_name ?? "no tutor"}</span></Td>
                        <Td><Badge tone={lessonTone(l.status)}>{l.status.replace(" (lesson burned)", " (burned)")}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card title="Recent money" flush className="lg:col-span-2" action={<Link to="/finance" className="text-xs font-medium text-indigo-600 hover:underline">Full ledger</Link>}>
              {d.recent_money.length === 0 ? <Empty>No entries yet.</Empty> : (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Type</Th><Th>From / to</Th><Th right>Cash flow</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.recent_money.map((e) => (
                      <tr key={e.id}>
                        <Td>{formatDate(e.entry_date)}</Td><Td>{e.type}</Td><Td>{e.who ?? "—"}</Td>
                        <Td right>{e.type === "Partner transfer" ? <span className="text-slate-400">{rm(e.amount_cents)} between founders</span> : <Money cents={e.cash_flow_cents} signed />}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}
      {modal === "lesson" && <LessonForm tutors={lookups.tutors} students={lookups.students} onSaved={done} onClose={() => setModal(null)} />}
      {modal === "payment" && <EntryForm tutors={lookups.tutors} students={lookups.students} onSaved={done} onClose={() => setModal(null)} />}
    </div>
  );
}
