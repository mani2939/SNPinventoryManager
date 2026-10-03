"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
          workspace: form.get("workspace"),
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      router.replace(v.redirect === "/invoices" ? "/invoices" : "/inventory");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      method="post"
      action="/api/auth/login"
      className="login-form"
    >
      <label>
        Username
        <input
          name="username"
          autoComplete="username"
          required
          maxLength={100}
          placeholder="Enter your username"
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          placeholder="Enter your password"
        />
      </label>
      <label>
        Workspace
        <select name="workspace" defaultValue="inventory" required>
          <option value="inventory">Inventory Manager</option>
          <option value="invoicing">Invoicing</option>
        </select>
      </label>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      <button className="button primary" disabled={busy || !ready}>
        <LockKeyhole size={17} />
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
