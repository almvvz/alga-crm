import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { client, makeUser, resetDb, startServer, pool, PASSWORD } from "./helpers.js";

let srv;
before(async () => {
  await resetDb();
  srv = await startServer();
});
after(async () => {
  await srv.close();
  await pool.end();
});

test("API is closed to strangers", async () => {
  const c = client(srv.base);
  for (const p of ["/api/students", "/api/lessons", "/api/finance", "/api/settlement", "/api/dashboard", "/api/settings", "/api/users", "/api/export/finance.csv"]) {
    assert.equal((await c.get(p)).status, 401, p);
  }
  assert.equal((await c.get("/api/health")).status, 200);
});

test("login: wrong password, unknown user and deactivated user look the same", async () => {
  await makeUser("a@alga.test", "Almaz A");
  await makeUser("gone@alga.test", "Gone", { active: false });
  const c = client(srv.base);
  const bad = await c.login("a@alga.test", "nope-nope-nope");
  const none = await c.login("nobody@alga.test");
  const off = await c.login("gone@alga.test");
  for (const r of [bad, none, off]) {
    assert.equal(r.status, 401);
    assert.equal(r.data.error, "Wrong email or password");
  }
  const ok = await c.login("A@alga.test"); // email is case-insensitive
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, "admin");
  assert.equal((await c.get("/api/auth/me")).status, 200);
});

test("cookie is httpOnly + SameSite and sessions end at logout", async () => {
  const c = client(srv.base);
  const r = await c.login("a@alga.test");
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  await c.post("/api/auth/logout");
  assert.equal((await c.get("/api/students")).status, 401);
});

test("forced password change blocks everything until done", async () => {
  await makeUser("new@alga.test", "New Person", { must_change: true });
  const c = client(srv.base);
  await c.login("new@alga.test");
  const blocked = await c.get("/api/students");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "PASSWORD_CHANGE_REQUIRED");

  assert.equal((await c.post("/api/auth/change-password", { current_password: PASSWORD, new_password: "short" })).status, 400);
  assert.equal((await c.post("/api/auth/change-password", { current_password: "wrong-wrong-wrong", new_password: "a-brand-new-password" })).status, 400);
  assert.equal((await c.post("/api/auth/change-password", { current_password: PASSWORD, new_password: "a-brand-new-password" })).status, 200);
  assert.equal((await c.get("/api/students")).status, 200);
});

test("cross-site writes are rejected, same-site writes pass", async () => {
  const c = client(srv.base);
  await c.login("a@alga.test");
  const evil = await c.post("/api/students", { full_name: "X" }, { Origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  const host = new URL(srv.base).host;
  const fine = await c.post("/api/students", { full_name: "Origin Ok" }, { Origin: `http://${host}` });
  assert.equal(fine.status, 201);
});

test("users: can't lock yourself out or remove the last admin", async () => {
  const c = client(srv.base);
  await c.login("a@alga.test");
  const list = (await c.get("/api/users")).data;
  const me = list.find((u) => u.email === "a@alga.test");
  const r = await c.put(`/api/users/${me.id}`, { full_name: me.full_name, role: "admin", active: false });
  assert.equal(r.status, 400);
  const weak = await c.post("/api/users", { email: "x@alga.test", full_name: "X", password: "short" });
  assert.equal(weak.status, 400);
  const made = await c.post("/api/users", { email: "x@alga.test", full_name: "X", password: "long-enough-password" });
  assert.equal(made.status, 201);
  assert.equal(made.data.must_change_password, true);
  assert.equal(made.data.password_hash, undefined);
  assert.equal((await c.post("/api/users", { email: "x@alga.test", full_name: "X2", password: "long-enough-password" })).status, 409);
});
