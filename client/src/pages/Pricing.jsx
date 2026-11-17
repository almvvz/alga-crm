import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Card, ErrorBox, Loading, PageHeader, inputCls, useAction, useLoad } from "../components/ui.jsx";
import { fromCents, toCents } from "../utils.js";

export default function Pricing() {
  const { data, error, loading, reload } = useLoad(() => api.settings(), []);
  const [vals, setVals] = useState({});
  const [saved, setSaved] = useState(false);
  const act = useAction();

  // Money shows as RM; the server stores sen.
  useEffect(() => {
    if (data) setVals(Object.fromEntries(data.map((s) => [s.key, s.kind === "money" ? fromCents(s.value) : String(s.value)])));
  }, [data]);

  async function save(e) {
    e.preventDefault();
    setSaved(false);
    const out = {};
    for (const s of data) {
      const raw = vals[s.key];
      if (s.kind === "money") {
        const c = toCents(raw);
        if (c == null) return act.setError(`“${s.label}” must be an amount like 40 or 12.50`);
        out[s.key] = c;
      } else {
        const n = Number(raw);
        if (raw === "" || !Number.isFinite(n) || n < 0) return act.setError(`“${s.label}” must be a number`);
        out[s.key] = n;
      }
    }
    const ok = await act.run(async () => { await api.saveSettings(out); return true; });
    if (ok) { setSaved(true); reload(); }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Pricing" subtitle="Change a price here and every screen uses it." />
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Heads up: lesson revenue and tutor pay are calculated from these prices, so changing one also changes the numbers for lessons already logged (the Excel worked the same way).
      </p>
      <ErrorBox message={error || act.error} />
      {loading && !data ? <Loading /> : data && (
        <form onSubmit={save}>
          <Card flush>
            <ul className="divide-y divide-slate-100">
              {data.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{s.label}</p>
                    {s.comment && <p className="text-xs text-slate-500">{s.comment}</p>}
                  </div>
                  <div className="flex w-36 items-center gap-2">
                    {s.kind === "money" && <span className="text-sm text-slate-500">RM</span>}
                    <input className={`${inputCls} text-right`} inputMode="decimal" aria-label={s.label} value={vals[s.key] ?? ""}
                      onChange={(e) => { setSaved(false); setVals((v) => ({ ...v, [s.key]: e.target.value })); }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={act.busy}>{act.busy ? "Saving…" : "Save prices"}</Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </form>
      )}
    </div>
  );
}
