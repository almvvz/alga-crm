// Money is stored as whole sen on the server (1 RM = 100). Show and read RM here.
export function rm(cents, { sign = false } = {}) {
  if (cents == null) return "—";
  const n = Number(cents) / 100;
  const s = Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `−RM ${s}`;
  return `${sign && n > 0 ? "+" : ""}RM ${s}`;
}

// "12.5" -> 1250. Returns null if it isn't a valid amount (so the form can complain).
export function toCents(text) {
  const s = String(text ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const fromCents = (cents) => (cents == null ? "" : (Number(cents) / 100).toFixed(2).replace(/\.00$/, ""));

// Dates come from the server as "2026-11-16" (no timezone games).
export function formatDate(ymd) {
  if (!ymd) return "—";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export const formatTime = (t) => (t ? String(t).slice(0, 5) : "");

// Today in Kuala Lumpur, as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
export function daysAgo(n) {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
export const cn = (...parts) => parts.filter(Boolean).join(" ");
