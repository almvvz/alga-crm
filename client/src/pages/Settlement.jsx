import { api } from "../api.js";
import { Badge, Card, ErrorBox, Loading, Money, PageHeader, Stat, Table, Td, Th, useLoad } from "../components/ui.jsx";
import { rm } from "../utils.js";

export default function Settlement() {
  const { data: s, error, loading } = useLoad(() => api.settlement(), []);
  return (
    <div>
      <PageHeader title="Settlement" subtitle="Profit split between the founders, who holds the cash, what is owed" />
      <ErrorBox message={error} />
      {loading && !s && <Loading />}
      {s && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Revenue from held lessons" value={rm(s.revenue_cents)} />
            <Stat label="Tutor rates accrued" value={rm(s.tutor_accrued_cents)} />
            <Stat label="Profit before split" value={rm(s.profit_cents)} tone={s.profit_cents < 0 ? "bad" : "good"} />
          </div>

          <Card title="Founders" flush>
            <Table>
              <thead><tr><Th>Founder</Th><Th right>Share of profit</Th><Th right>Received</Th><Th right>Paid out</Th><Th right>Transfers (in / out)</Th><Th right>Holds now</Th><Th right>To settle</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.partners.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-medium text-slate-900">{p.name}</Td>
                    <Td right><Money cents={p.share_cents} /></Td><Td right><Money cents={p.received_cents} /></Td><Td right><Money cents={p.spent_cents} /></Td>
                    <Td right>{rm(p.transfers_in_cents)} / {rm(p.transfers_out_cents)}</Td>
                    <Td right className="font-semibold"><Money cents={p.holds_cents} /></Td>
                    <Td right>{p.shortfall_cents > 0 ? <Badge tone="amber">{rm(p.shortfall_cents)} to receive</Badge> : <span className="text-slate-400">—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="px-4 py-3 text-xs text-slate-500">“To receive” = the founder’s share of profit minus the cash they hold. The other founder transfers it, then records a Partner transfer in Finance.</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Not yet paid to tutors" value={rm(s.not_paid_to_tutors_cents)} hint="Accrued tutor rates minus payouts. Negative means paid ahead." tone={s.not_paid_to_tutors_cents > 0 ? "bad" : undefined} />
            <Stat label="Prepayments" value={rm(s.prepayment_cents)} hint="Student money for lessons not held yet. This is not profit." />
          </div>

          <Card title="Per tutor" flush>
            {s.tutors.length === 0 ? <p className="p-4 text-sm text-slate-500">No tutors yet.</p> : (
              <Table>
                <thead><tr><Th>Tutor</Th><Th right>Earned</Th><Th right>Paid</Th><Th right>Owed</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {s.tutors.map((t) => <tr key={t.id}><Td>{t.name}</Td><Td right><Money cents={t.earned_cents} /></Td><Td right><Money cents={t.paid_cents} /></Td><Td right><Money cents={t.owed_cents} /></Td></tr>)}
                </tbody>
              </Table>
            )}
          </Card>
          {s.notes.map((n) => <p key={n} className="text-xs text-slate-500">{n}</p>)}
        </div>
      )}
    </div>
  );
}
