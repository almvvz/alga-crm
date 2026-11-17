import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { Button, ErrorBox, Field, inputCls, useAction } from "../components/ui.jsx";

// Shown instead of the app until a new account (or a reset one) picks its own password.
export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const { busy, error, setError, run } = useAction();

  async function submit(e) {
    e.preventDefault();
    if (next !== again) return setError("The two new passwords don't match");
    await run(() => changePassword(current, next));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">Hi {user.full_name}. Before you continue, pick your own password (at least 10 characters).</p>
        </div>
        <ErrorBox message={error} />
        <Field label="Current (temporary) password"><input className={inputCls} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password"><input className={inputCls} type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="New password again"><input className={inputCls} type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</Button>
        <button type="button" onClick={logout} className="block w-full text-center text-xs text-slate-500 hover:text-slate-800">Sign out</button>
      </form>
    </div>
  );
}
