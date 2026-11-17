import { useState } from "react";
import { api } from "../api.js";
import { ENTRY_TYPES } from "../constants.js";
import { EntryForm } from "../components/forms.jsx";
import { DownloadIcon } from "../components/icons.jsx";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, PageHeader, Table, Td, Th, inputCls, useAction, useLoad } from "../components/ui.jsx";
import { useLookups } from "../lookups.js";
import { daysAgo, formatDate, rm } from "../utils.js";

const typeTone = (t) => (["Student payment", "Other income"].includes(t) ? "green" : t === "Partner transfer" ? "indigo" : t === "Student refund" ? "red" : "amber");

export default function Finance() {
  const [f, setF] = useState({ from: daysAgo(30), to: "", type: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { data, error, loading, reload } = useLoad(() => api.finance.list(f), [f.from, f.to, f.type]);
  const { tutors, students, ready } = useLookups();
  const [editing, setEditing] = useState(null);
  const act = useAction();
  const rows = data ?? [];
  const net = rows.reduce((a, e) => a + Number(e.cash_flow_cents), 0);
  const inflow = rows.reduce((a, e) => a + Math.max(0, Number(e.cash_flow_cents)), 0);
  const outflow = rows.reduce((a, e) => a + Math.min(0, Number(e.cash_flow_cents)), 0);

  async function remove(e) {
    if (!confirm("Delete this entry? The books will change.")) return;
    await act.run(async () => { await api.finance.remove(e.id); setEditing(null); reload(); });
  }

  return (
    <div>
      <PageHeader title="Finance" subtitle="Every ringgit in and out. Record each payment the same day.">
        <a href="/api/export/finance.csv"><Button variant="secondary"><DownloadIcon />CSV</Button></a>
        <Button disabled={!ready} onClick={() => setEditing("new")}>+ New entry</Button>
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-500">From<input type="date" className={inputCls} value={f.from} onChange={set("from")} /></label>
        <label className="text-xs text-slate-500">To<input type="date" className={inputCls} value={f.to} onChange={set("to")} /></label>
        <label className="text-xs text-slate-500">Type<select className={inputCls} value={f.type} onChange={set("type")}><option value="">All types</option>{ENTRY_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <ErrorBox message={error || act.error} />
      <Card flush>
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>No entries in this view.</Empty> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Type</Th><Th>From / to</Th><Th>For what</Th><Th>Method</Th><Th>Who</Th><Th right>Amount</Th><Th right>Cash flow</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditing(e)}>
                  <Td>{formatDate(e.entry_date)}</Td><Td><Badge tone={typeTone(e.type)}>{e.type}</Badge></Td>
                  <Td>{e.who ?? "—"}</Td><Td className="max-w-48 truncate">{e.purpose ?? "—"}</Td><Td>{e.method ?? "—"}</Td><Td>{e.handled_by_name}</Td>
                  <Td right><Money cents={e.amount_cents} /></Td>
                  <Td right>{e.type === "Partner transfer" ? <span className="text-slate-400">—</span> : <Money cents={e.cash_flow_cents} signed />}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <Td colSpan={7}>{rows.length} entr{rows.length === 1 ? "y" : "ies"} · in {rm(inflow)} · out {rm(-outflow)}</Td>
                <Td right><Money cents={net} signed /></Td>
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
      {editing && (
        <EntryForm entry={editing === "new" ? null : editing} tutors={tutors} students={students}
          onDelete={remove} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}
