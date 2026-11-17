import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { STUDENT_STATUSES } from "../constants.js";
import { StudentForm } from "../components/forms.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, PageHeader, Table, Td, Th, inputCls, studentTone, useLoad } from "../components/ui.jsx";
import { DownloadIcon } from "../components/icons.jsx";
import { useLookups } from "../lookups.js";

export default function Students() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const { data, error, loading } = useLoad(() => api.students.list({ q, status }), [q, status]);
  const { tutors } = useLookups();

  return (
    <div>
      <PageHeader title="Students" subtitle="Everyone who has paid, is paying, or is on a pack">
        <a href="/api/export/students.csv"><Button variant="secondary"><DownloadIcon />CSV</Button></a>
        <Button onClick={() => setAdding(true)}>+ New student</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-3">
        <input className={`${inputCls} max-w-xs`} placeholder="Search name, contact, code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputCls} max-w-48`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{STUDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <ErrorBox message={error} />
      <Card flush>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>{q || status ? "No students match." : "No students yet. Add the first one."}</Empty> : (
          <Table>
            <thead><tr><Th>ID</Th><Th>Name</Th><Th>Product</Th><Th>Tutor</Th><Th right>Paid</Th><Th right>Held / paid</Th><Th right>Left</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/students/${s.id}`)}>
                  <Td className="text-slate-400">{s.code}</Td>
                  <Td><Link to={`/students/${s.id}`} className="font-medium text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>{s.full_name}</Link>
                    {s.group_code && <span className="ml-2 text-xs text-slate-400">{s.group_code}</span>}</Td>
                  <Td>{s.product ?? "—"}</Td>
                  <Td>{s.tutor_name ?? "—"}</Td>
                  <Td right><Money cents={s.paid_cents} /></Td>
                  <Td right>{s.lessons_held} / {s.lessons_paid}</Td>
                  <Td right>{s.product === "Intensive" ? "—" : <Badge tone={s.lessons_remaining <= 0 ? "red" : s.lessons_remaining === 1 ? "amber" : "slate"}>{s.lessons_remaining}</Badge>}</Td>
                  <Td><Badge tone={studentTone(s.status)}>{s.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {adding && <StudentForm tutors={tutors} onClose={() => setAdding(false)} onSaved={(s) => navigate(`/students/${s.id}`)} />}
    </div>
  );
}
