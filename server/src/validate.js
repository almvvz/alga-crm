import { badRequest } from "./errors.js";

// Small input checkers. Each one either returns a clean value or throws a 400
// with a message a human can read.

export function parseId(value, label = "id") {
  const n = Number(value);
  if (value === "" || !Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${label}`);
  return n;
}

export function reqText(value, label, max = 200) {
  const s = String(value ?? "").trim();
  if (!s) throw badRequest(`${label} is required`);
  if (s.length > max) throw badRequest(`${label} is too long (max ${max} characters)`);
  return s;
}

export function optText(value, label, max = 200) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (s.length > max) throw badRequest(`${label} is too long (max ${max} characters)`);
  return s;
}

export function optInt(value, label, { min = 0, max = 2_000_000_000 } = {}) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${label} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

export function reqInt(value, label, opts) {
  const n = optInt(value, label, opts);
  if (n === null) throw badRequest(`${label} is required`);
  return n;
}

export function optDate(value, label) {
  if (value === "" || value == null) return null;
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  // An impossible date (2026-13-45) gives an Invalid Date, and 2026-02-31 rolls over to March.
  const ok = d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  if (!ok) throw badRequest(`${label} must be a real date (YYYY-MM-DD)`);
  return s;
}

export function reqDate(value, label) {
  const d = optDate(value, label);
  if (!d) throw badRequest(`${label} is required`);
  return d;
}

export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw badRequest(`${label} must be one of: ${allowed.join(", ")}`);
  return value;
}

// req.body is undefined when nothing was sent; make sure routes always get an object.
export function bodyOf(req) {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== "object" || Array.isArray(b)) throw badRequest("Request body must be a JSON object");
  return b;
}

// Money arrives as whole sen (1 RM = 100). Rejects fractions and negatives.
export function reqCents(value, label, { min = 1, max = 100_000_000 } = {}) {
  const n = Number(value);
  if (value === "" || value == null || !Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${label} must be an amount in sen between ${min} and ${max}`);
  }
  return n;
}

export function optBool(value) {
  return value === true || value === "true" || value === 1;
}
