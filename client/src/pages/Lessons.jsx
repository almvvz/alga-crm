import { useState } from "react";
import { api } from "../api.js";
import { FORMATS, LESSON_STATUSES } from "../constants.js";
import { LessonForm } from "../components/forms.jsx";
import { DownloadIcon } from "../components/icons.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, PageHeader, Table, Td, Th, inputCls, lessonTone, useAction, useLoad } from "../components/ui.jsx";
import { useLookups } from "../lookups.js";
import { daysAgo, formatDate, formatTime, today } from "../utils.js";

export default function Lessons() {
  const [f, setF] = useState({ from: daysAgo(30), to: "", tutor_id: "", status: "", format: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { data, error, loading, reload } = useLoad(() => api.lessons.list(f), [f.from, f.to, f.tutor_id, f.status, f.format]);
  const { tutors, students, ready } = useLookups();
  const [editing, setEditing] = useState(null); // lesson | "new"
  const act = useAction();

  const rows = data ?? [];
  const revenue = rows.reduce((a, l) => a + Number(l.revenue_cents), 0);
  const tutor = rows.reduce((a, l) => a + Number(l.tutor_cents), 0);

  // One click for the most common daily job: a scheduled lesson took place.
  async function markHeld(l) {
    await act.run(async () => {
      await api.lessons.update(l.id, { ...l, lesson_time: formatTime(l.lesson_time), student_ids: l.students.map((s) => s.id), status: "Held", logged_same_day: l.lesson_date === today() });
      reload();
    });
  }
  async function remove(l) {
    if (!confirm("Delete this lesson? Revenue and tutor pay for it will disappear.")) return;
    await act.run(async () => { await api.lessons.remove(l.id); setEditing(null); reload(); });
  }

  return (
    <div>
      <PageHeader title="Lessons" subtitle="Every lesson: held, burned, cancelled. Revenue and tutor pay are worked out for you.">
        <a href="/api/export/lessons.csv"><Button variant="secondary"><DownloadIcon />CSV</Button></a>
        <Button disabled={!ready} onClick={() => setEditing("new")}>+ Log lesson</Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-slate-500">From<input type="date" className={inputCls} value={f.from} onChange={set("from")} /></label>
        <label className="text-xs text-slate-500">To<input type="date" className={inputCls} value={f.to} onChange={set("to")} /></label>
        <label className="text-xs text-slate-500">Tutor
          <select className={inputCls} value={f.tutor_id} onChange={set("tutor_id")}><option value="">All tutors</option>{tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="text-xs text-slate-500">Format
          <select className={inputCls} value={f.format} onChange={set("format")}><option value="">All formats</option>{FORMATS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="text-xs text-slate-500">Status
          <select className={inputCls} value={f.status} onChange={set("status")}><option value="">All statuses</option>{LESSON_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>

      <ErrorBox message={error || act.error} />
      <Card flush>
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>No lessons in this view.</Empty> : (
          <Table>
            <thead><tr><Th>When</Th><Th>Format</Th><Th>Students</Th><Th>Tutor</Th><Th>Status</Th><Th right>Revenue</Th><Th right>Tutor</Th><Th right>Margin</Th><Th> </Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => (
                <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditing(l)}>
                  <Td>{formatDate(l.lesson_date)} <span className="text-slate-400">{formatTime(l.lesson_time)}</span></Td>
                  <Td>{l.format}{l.group_code && <span className="ml-1 text-xs text-slate-400">{l.group_code}</span>}</Td>
                  <Td className="max-w-56 truncate">{l.students.map((s) => s.full_name).join(", ") || "—"}</Td>
                  <Td>{l.tutor_name ?? "—"}</Td>
                  <Td><Badge tone={lessonTone(l.status)}>{l.status.replace(" (lesson burned)", " (burned)")}</Badge></Td>
                  <Td right><Money cents={l.revenue_cents} /></Td>
                  <Td right><Money cents={l.tutor_cents} /></Td>
                  <Td right><Money cents={Number(l.revenue_cents) - Number(l.tutor_cents)} signed /></Td>
                  <Td>{l.status === "Scheduled" && <Button size="sm" variant="secondary" disabled={act.busy} onClick={(e) => { e.stopPropagation(); markHeld(l); }}>Mark held</Button>}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <Td colSpan={5}>{rows.length} lesson{rows.length === 1 ? "" : "s"}</Td>
                <Td right><Money cents={revenue} /></Td><Td right><Money cents={tutor} /></Td><Td right><Money cents={revenue - tutor} signed /></Td><Td> </Td>
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
      {rows.length >= 500 && <p className="mt-2 text-xs text-slate-500">Showing the latest 500. Narrow the dates to see older lessons.</p>}

      {editing && (
        <LessonForm
          lesson={editing === "new" ? null : editing}
          tutors={tutors} students={students}
          onDelete={remove} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
