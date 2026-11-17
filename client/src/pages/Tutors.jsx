import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { TUTOR_STATUSES } from "../constants.js";
import { TutorForm } from "../components/tutorForm.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, PageHeader, Table, Td, Th, useLoad } from "../components/ui.jsx";

export const decisionTone = (d) => (d === "Hire" ? "green" : d === "Don't hire" ? "red" : "amber");

export default function Tutors() {
  const { data, error, loading } = useLoad(() => api.tutors.list(), []);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Tutors" subtitle="Candidates, active tutors, what each is owed">
        <Button onClick={() => setAdding(true)}>+ New tutor</Button>
      </PageHeader>
      <ErrorBox message={error} />
      <Card flush>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No tutors yet.</Empty> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Subject</Th><Th>Status</Th><Th right>Lessons held</Th><Th right>Earned</Th><Th right>Paid</Th><Th right>Owed</Th><Th>Score</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/tutors/${t.id}`)}>
                  <Td><Link to={`/tutors/${t.id}`} className="font-medium text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>{t.name}</Link></Td>
                  <Td>{t.subject ?? "—"}</Td>
                  <Td><Badge tone={t.status === "Active" ? "green" : t.status === "Candidate" ? "blue" : "slate"}>{t.status}</Badge></Td>
                  <Td right>{t.lessons_held}</Td><Td right><Money cents={t.earned_cents} /></Td><Td right><Money cents={t.paid_cents} /></Td>
                  <Td right><Money cents={t.owed_cents} /></Td>
                  <Td>{t.decision ? <><span className="mr-2 tabular-nums">{t.average}</span><Badge tone={decisionTone(t.decision)}>{t.decision}</Badge></> : <span className="text-slate-400">not scored</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {adding && <TutorForm onClose={() => setAdding(false)} onSaved={(t) => navigate(`/tutors/${t.id}`)} />}
    </div>
  );
}
