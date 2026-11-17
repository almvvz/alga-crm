import { once } from "node:events";
process.env.NODE_ENV = "test";

const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url)) {
  console.error("Refusing to run tests: DATABASE_URL must point at a database with 'test' in its name (tests wipe data).");
  process.exit(1);
}

const { createApp } = await import("../src/index.js");
const { pool, query } = await import("../src/db.js");
const { runMigrations } = await import("../src/migrate.js");
const { hashPassword } = await import("../src/auth.js");

export { pool, query };
export const PASSWORD = "correct-horse-battery";

export async function resetDb() {
  await runMigrations({ quiet: true });
  await query(`TRUNCATE finance_entries, lesson_students, lessons, tutor_scores, tutors, students, sessions, users RESTART IDENTITY CASCADE`);
  await query(`UPDATE settings SET value = CASE key
      WHEN 'duo_price' THEN 2500 WHEN 'f2f_single' THEN 4000 WHEN 'f2f_pack' THEN 14000 WHEN 'tutor_rate' THEN 2500
      WHEN 'solo_after_duo' THEN 3500 WHEN 'pack_lessons' THEN 4 WHEN 'noshow_share' THEN 0.5 ELSE value END`);
}

export async function makeUser(email, full_name, { must_change = false, active = true } = {}) {
  const { rows } = await query(
    `INSERT INTO users (email, full_name, password_hash, role, must_change_password, active)
     VALUES ($1,$2,$3,'admin',$4,$5) RETURNING id`,
    [email, full_name, await hashPassword(PASSWORD), must_change, active]
  );
  return rows[0].id;
}

export async function startServer() {
  const server = createApp().listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

// A tiny browser: remembers the session cookie between calls.
export function client(base) {
  let cookie = "";
  async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const ct = res.headers.get("content-type") ?? "";
    // ignoreBOM keeps the UTF-8 byte-order mark so tests can check it.
    const data = res.status === 204 ? null : ct.includes("json") ? await res.json()
      : new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (p, h) => call("GET", p, undefined, h),
    post: (p, b = {}, h) => call("POST", p, b, h),
    put: (p, b = {}, h) => call("PUT", p, b, h),
    del: (p, h) => call("DELETE", p, undefined, h),
    login: async (email, password = PASSWORD) => {
      const r = await call("POST", "/api/auth/login", { email, password });
      return r;
    },
  };
}
