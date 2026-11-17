import { useState } from "react";
import { api } from "../api.js";
import Modal from "../components/Modal.jsx";
import { Badge, Button, Card, ErrorBox, Field, Loading, PageHeader, Table, Td, Th, inputCls, useAction, useLoad } from "../components/ui.jsx";
import { useAuth } from "../auth.jsx";
import { formatDate } from "../utils.js";

function NewUser({ onClose, onSaved }) {
  const [f, setF] = useState({ full_name: "", email: "", password: "" });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    const u = await run(() => api.users.create(f));
    if (u) onSaved();
  }
  return (
    <Modal title="New founder account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="Full name"><input className={inputCls} required autoFocus value={f.full_name} onChange={set("full_name")} /></Field>
        <Field label="Email"><input className={inputCls} type="email" required value={f.email} onChange={set("email")} /></Field>
        <Field label="Temporary password" hint="At least 10 characters. They must choose their own at first sign-in."><input className={inputCls} required minLength={10} value={f.password} onChange={set("password")} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Create account</Button></div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  async function submit(e) {
    e.preventDefault();
    const ok = await run(async () => { await api.users.resetPassword(user.id, password); return true; });
    if (ok) setDone(true);
  }
  return (
    <Modal title={`Reset password: ${user.full_name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3"><p className="text-sm text-emerald-700">Done. Give them the temporary password; they’ll be asked to change it, and they’ve been signed out everywhere.</p><Button onClick={onClose}>Close</Button></div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <ErrorBox message={error} />
          <Field label="New temporary password" hint="At least 10 characters."><input className={inputCls} required minLength={10} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Reset</Button></div>
        </form>
      )}
    </Modal>
  );
}

export default function Team() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.users.list(), []);
  const [modal, setModal] = useState(null);
  const act = useAction();

  async function toggle(u) {
    await act.run(async () => { await api.users.update(u.id, { full_name: u.full_name, role: "admin", active: !u.active }); reload(); });
  }
  return (
    <div>
      <PageHeader title="Team" subtitle="Founder accounts. Tutors don’t sign in yet.">
        <Button onClick={() => setModal("new")}>+ New founder</Button>
      </PageHeader>
      <ErrorBox message={error || act.error} />
      <Card flush>
        {loading && !data ? <Loading /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Status</Th><Th>Created</Th><Th> </Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium text-slate-900">{u.full_name}{u.id === me.id && <span className="ml-2 text-xs text-slate-400">you</span>}</Td>
                  <Td>{u.email}</Td>
                  <Td>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}{u.must_change_password && <span className="ml-2"><Badge tone="amber">must change password</Badge></span>}</Td>
                  <Td>{formatDate(u.created_at?.slice(0, 10))}</Td>
                  <Td><div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setModal({ reset: u })}>Reset password</Button>
                    {u.id !== me.id && <Button size="sm" variant={u.active ? "danger" : "secondary"} disabled={act.busy} onClick={() => toggle(u)}>{u.active ? "Deactivate" : "Reactivate"}</Button>}
                  </div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {modal === "new" && <NewUser onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.reset && <ResetPassword user={modal.reset} onClose={() => setModal(null)} />}
    </div>
  );
}
