import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.js";
import { query } from "./db.js";
import { HttpError, badRequest } from "./errors.js";

const scrypt = promisify(crypto.scrypt);

// ---------- passwords ----------
// scrypt is a deliberately slow, memory-hungry hash, so stolen hashes are
// expensive to crack. It ships with Node, so there is nothing extra to install.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [alg, n, r, p, saltB64, hashB64] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Logging in with an unknown email must take as long as a wrong password,
// otherwise attackers can use the timing to find out which emails exist.
let dummyHash;
export async function burnTime(password) {
  dummyHash ??= await hashPassword(crypto.randomBytes(8).toString("hex"));
  await verifyPassword(password, dummyHash);
}

export function checkPasswordStrength(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw badRequest("Password must be at least 10 characters");
  }
  if (password.length > 200) throw badRequest("Password is too long");
}

// ---------- sessions ----------
export const SESSION_COOKIE = "alga_session";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = config.sessionDays * 24 * 60 * 60 * 1000;
  await query("DELETE FROM sessions WHERE expires_at < now()"); // tidy up old ones
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    sha256(token),
    userId,
    new Date(Date.now() + maxAge),
  ]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript in the page can't read it
    sameSite: "lax", // not sent on cross-site POSTs
    secure: config.isProd, // https only in production
    maxAge,
    path: "/",
  });
}

export async function destroySession(req, res) {
  if (req.sessionHash) await query("DELETE FROM sessions WHERE token_hash = $1", [req.sessionHash]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

// Runs on every /api request: if the cookie matches a live session of an
// active user, req.user is set. It never rejects; the guards below do that.
export async function attachUser(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const hash = sha256(token);
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.must_change_password
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
      [hash]
    );
    if (rows[0]) {
      req.user = rows[0];
      req.sessionHash = hash;
    }
  }
  next();
}

// ---------- guards ----------
export function needUser(req, res, next) {
  if (!req.user) throw new HttpError(401, "Please sign in");
  next();
}

// Normal routes: signed in, and not stuck on a forced password change.
export function requireAuth(req, res, next) {
  if (!req.user) throw new HttpError(401, "Please sign in");
  if (req.user.must_change_password) {
    throw new HttpError(403, "Please set a new password first", "PASSWORD_CHANGE_REQUIRED");
  }
  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") throw new HttpError(403, "Only admins can do that");
    next();
  });
}

// Cookies are sent automatically by the browser, so a malicious site could
// try to make your browser POST to this server. Reject writes whose Origin
// header points at a different site.
export function sameOriginOnly(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.get("origin");
  if (origin) {
    let ok = false;
    try {
      const o = new URL(origin);
      const hosts = [req.get("host"), req.get("x-forwarded-host")].filter(Boolean);
      ok = hosts.includes(o.host);
      // Local development: the Vite dev server (another port) forwards requests here.
      // Never relaxed in production.
      if (!ok && !config.isProd && !config.isTest && ["localhost", "127.0.0.1", "[::1]"].includes(o.hostname)) ok = true;
    } catch {
      /* malformed Origin header */
    }
    if (!ok) throw new HttpError(403, "Cross-site request blocked");
  }
  next();
}

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  must_change_password: u.must_change_password,
});