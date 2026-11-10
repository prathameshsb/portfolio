"use client";
import { useEffect, useState } from "react";
import styles from "../../components/analytics/Dashboard.module.css";

function returnToDashboard() {
  try { localStorage.setItem("portfolio-analytics-traffic", "owner"); } catch { /* This optional exclusion hint never authenticates a request. */ }
  window.location.reload();
}

export default function OwnerLogin() {
  const [csrfToken, setCsrfToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Loading owner login…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/owner/login", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]), headers: { Accept: "application/json" } })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !body || typeof body !== "object" || !("csrfToken" in body) || typeof body.csrfToken !== "string") {
          setMessage(response.status === 503 ? "Owner login has not been configured yet." : "Owner login is unavailable. Retry shortly.");
          setReady(false); return;
        }
        if ("authenticated" in body && body.authenticated === true) { returnToDashboard(); return; }
        setCsrfToken(body.csrfToken); setReady(true); setMessage("");
      }).catch(() => {
        if (!controller.signal.aborted) { setMessage("Owner login is unavailable. Retry shortly."); setReady(false); }
      });
    return () => controller.abort();
  }, [retry]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/owner/login", {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password, csrfToken }),
      });
      setPassword("");
      if (response.ok) {
        returnToDashboard(); return;
      }
      setMessage(response.status === 429 ? "Too many attempts. Try again in five minutes." : response.status === 403 ? "The login form expired. Refresh it and try again." : response.status === 401 ? "Password not recognized." : "Owner login is unavailable. Retry shortly.");
      if (response.status === 403) { setReady(false); setRetry((value) => value + 1); }
    } catch { setMessage("Owner login is unavailable. Retry shortly."); }
    finally { setBusy(false); }
  }
  return <section className={styles.dashboard} aria-label="Owner access">
    <header className={styles.header}><div><p className={styles.eyebrow}>Private workspace</p><h1>Owner login</h1><p>Sign in to view the existing portfolio tracker.</p></div></header>
    <form className={styles.filters} onSubmit={submit} aria-label="Owner login">
      <label>Password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} disabled={!ready || busy} /></label>
      <button className={styles.primary} type="submit" disabled={!ready || busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {message && <p role="status" className={styles.formError}>{message}</p>}
      {!ready && <button type="button" onClick={() => setRetry((value) => value + 1)}>Refresh login</button>}
    </form>
  </section>;
}
