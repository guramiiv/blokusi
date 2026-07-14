"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, saveAuth } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ token: string; username: string }>(
        "/auth/register/",
        { method: "POST", body: { username, password }, auth: false }
      );
      saveAuth(res.token, res.username);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Blokus — Register</h1>
        <input
          placeholder="Username (min 3 chars)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          placeholder="Password (min 6 chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error-text">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <div className="muted">
          Have an account? <Link href="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
