"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "הכניסה נכשלה");
    } catch {
      setError("אין חיבור לשרת. נסו שוב.");
    }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <CheckSquare size={26} />
        </div>
        <h1>משימות</h1>
        <p className="muted">מרחבי עבודה עם סוכן חכם. הכניסה באמצעות סיסמה.</p>
        <label className="field">
          <span>סיסמה</span>
          <div className="input-icon">
            <Lock size={16} />
            <input
              type="password"
              className="input"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="הקלידו את הסיסמה"
            />
          </div>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? "נכנס…" : "כניסה"}
        </button>
      </form>
    </div>
  );
}
