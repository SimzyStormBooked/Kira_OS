"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeRedirectPath } from "@/lib/auth/security";

export function LoginForm({ next, email = null }: { next: string; email?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ email: String(data.get("email") ?? "").trim(), password: data.get("password"), next }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "We could not sign you in. Please try again.");
        const password = form.elements.namedItem("password");
        if (password instanceof HTMLInputElement) password.value = "";
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      window.location.assign(safeRedirectPath(result.redirectTo));
    } catch {
      setError("We could not reach your workspace. Check your connection and try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={signIn} aria-busy={pending}>
      <div className="login-field">
        <label className="form-label" htmlFor="login-email">Email address</label>
        <Input id="login-email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={pending} defaultValue={email ?? undefined} />
      </div>
      <div className="login-field">
        <label className="form-label" htmlFor="login-password">Password</label>
        <Input id="login-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={pending} autoFocus={Boolean(email)} aria-describedby={error ? "login-error" : undefined} />
      </div>
      {error && <p id="login-error" className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      <Button type="submit" className="login-submit" disabled={pending}>
        {pending ? "Opening your workspace…" : "Enter your workspace"}<ArrowUpRight size={16} />
      </Button>
      <p className="quiet-note login-privacy"><LockKeyhole size={13} /> Private access, by invitation. Your workspace owner can help with access or a password reset.</p>
    </form>
  );
}
