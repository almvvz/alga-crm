import { useCallback, useEffect, useState } from "react";
import { cn, rm } from "../utils.js";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 " +
  "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100";

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const BTN = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
};
export function Button({ variant = "primary", size = "md", className, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        BTN[variant],
        className
      )}
    />
  );
}

const TONES = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  indigo: "bg-indigo-100 text-indigo-700",
};
export function Badge({ tone = "slate", children }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}

export function lessonTone(status) {
  if (status === "Held") return "green";
  if (status === "Scheduled") return "blue";
  if (status?.includes("burned") || status?.startsWith("No-show")) return "amber";
  if (status?.includes("cancelled") || status === "Tutor cancelled") return "red";
  return "slate";
}
export function studentTone(status) {
  return status === "Active" ? "green" : status === "Finished" ? "slate" : "amber";
}

export function Card({ title, action, children, className, flush }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-slate-900")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const ErrorBox = ({ message }) =>
  message ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null;
export const Loading = () => <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
export const Empty = ({ children }) => <p className="py-8 text-center text-sm text-slate-500">{children}</p>;

// Table pieces share one look.
export const Table = ({ children }) => (
  <div className="overflow-x-auto"><table className="w-full text-left text-sm">{children}</table></div>
);
export const Th = ({ children, right }) => (
  <th className={cn("whitespace-nowrap bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500", right && "text-right")}>{children}</th>
);
export const Td = ({ children, right, className, ...p }) => (
  <td {...p} className={cn("whitespace-nowrap px-3 py-2.5 text-slate-700", right && "text-right tabular-nums", className)}>{children}</td>
);

export function Money({ cents, signed }) {
  const n = Number(cents);
  return (
    <span className={cn("tabular-nums", signed && n < 0 && "text-red-600", signed && n > 0 && "text-emerald-600")}>
      {cents == null ? "—" : rm(cents, { sign: signed })}
    </span>
  );
}

// Loads data when the page opens (and when `deps` change). `reload()` refetches.
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    fn().then(
      (data) => alive && setState({ data, error: "", loading: false }),
      (err) => alive && setState({ data: null, error: err.message, loading: false })
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// Runs a save/delete action, tracks "busy" and the error message for a form.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
