// CSV with a UTF-8 BOM so Excel opens accents correctly, and protection
// against "formula injection" (a cell starting with = + - @ runs in Excel).
export function toCsv(columns, rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(typeof c.get === "function" ? c.get(r) : r[c.key])).join(","));
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}

export const rm = (cents) => (cents == null ? "" : (Number(cents) / 100).toFixed(2));
