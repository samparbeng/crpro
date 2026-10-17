import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { ErrorAlert, Field } from "../components/ui";

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="card-body">
          <div className="brand">
            <img src="/favicon.svg" alt="" />
            crpro
          </div>
          <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>Transport operations</p>
          <ErrorAlert error={error} />
          <div className="grid">
            <Field label="Username">
              <input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn btn-primary" disabled={busy || !username || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
