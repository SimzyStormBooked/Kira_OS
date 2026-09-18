"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

type EntryState = "reading" | "ready" | "missing" | "invalid" | "opening" | "complete";

export function OneTimeSignIn({ authorizedEmail }: { authorizedEmail?: string | null }) {
  const token = useRef<string | null>(null);
  const captured = useRef(false);
  const requestLock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [state, setState] = useState<EntryState>("reading");
  const [error, setError] = useState<string | null>(null);
  const [linkAttempted, setLinkAttempted] = useState(false);
  // A deliberate account-switch attempt may replace or clear the old session.
  const canContinue = authorizedEmail !== undefined && !linkAttempted;

  useEffect(() => {
    // Hash navigation can reopen a link without remounting this page. Every
    // fragment is scrubbed, while a pending verification keeps its own token.
    const captureFragment = () => {
      const fragment = window.location.hash.slice(1);
      window.history.replaceState(window.history.state, "", window.location.pathname);
      if (requestLock.current) return;
      const values = new URLSearchParams(fragment).getAll("token_hash");
      const candidate = values.length === 1 ? values[0] : "";
      token.current = /^[a-zA-Z0-9_-]{20,512}$/.test(candidate) ? candidate : null;
      queueMicrotask(() => {
        if (requestLock.current) return;
        setError(null);
        setState(token.current ? "ready" : "missing");
      });
    };
    // React may replay effects; do not erase a captured token on that replay.
    if (!captured.current) {
      captured.current = true;
      captureFragment();
    }
    window.addEventListener("hashchange", captureFragment);
    return () => window.removeEventListener("hashchange", captureFragment);
  }, []);

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestLock.current || !token.current || state !== "ready") return;
    requestLock.current = true;
    setLinkAttempted(true);
    setState("opening");
    setError(null);
    try {
      const response = await fetch("/auth/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ token_hash: token.current }),
      });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const linkConsumed = Boolean(failure && typeof failure === "object" && "code" in failure && failure.code === "link_consumed");
        if (linkConsumed) {
          token.current = null;
          setState("invalid");
          showError("Your sign-in link was used, but we could not finish checking workspace access. Ask your workspace owner for a fresh link, or sign in with your email and password.");
        } else if ([400, 401, 403, 410, 422].includes(response.status)) {
          token.current = null;
          setState("invalid");
          showError(response.status === 403
            ? "This link could not open the workspace. Ask your workspace owner for a fresh link and access, or use your email and password."
            : "This link is no longer available. It may have expired or already been used. Ask your workspace owner for a fresh link, or use your email and password.");
        } else {
          setState("ready");
          showError(response.status === 429
            ? "Please give it a moment, then try again. Your link is still held in this tab."
            : "We could not confirm sign-in. Your link is still held in this tab; please try again.");
        }
        return;
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("redirectTo" in result) || result.redirectTo !== "/") {
        throw new Error("Unconfirmed sign-in response");
      }
      token.current = null;
      setState("complete");
      window.location.replace("/");
    } catch {
      setState("ready");
      showError("We could not confirm sign-in. Check your connection and try again. Your link is still held in this tab.");
    } finally {
      requestLock.current = false;
    }
  }

  return (
    <form className="login-form" onSubmit={(event) => void enter(event)} aria-busy={state === "reading" || state === "opening"}>
      {canContinue && <>
        <p role="status">Signed in as <strong>{authorizedEmail ?? "your workspace account"}</strong>.</p>
        {/* Crossing the public/private layout boundary needs a full document load. */}
        <Button asChild className="login-submit"><Link href="/" prefetch={false} onNavigate={(event) => { event.preventDefault(); window.location.replace("/"); }}>Continue to my workspace <ArrowUpRight size={16} aria-hidden="true" /></Link></Button>
        <Link href="/settings#account-password" className="text-link" prefetch={false} onNavigate={(event) => { event.preventDefault(); window.location.replace("/settings#account-password"); }}>Set my password <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </>}
      {state === "missing" && !canContinue && <p role="status">Open the full private link you received to continue. If you refreshed this page, reopen that original link.</p>}
      {error && <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      {canContinue && state === "ready" && <p className="quiet-note">You also opened a private sign-in link. Use it only if you want to sign in with that link instead of continuing with the account above.</p>}
      {state !== "missing" && state !== "invalid" && (!canContinue || state === "ready") && <Button type="submit" className={canContinue ? undefined : "login-submit"} variant={canContinue ? "outline" : "default"} disabled={state !== "ready"}>
        {state === "reading" ? "Preparing your welcome…" : state === "opening" || state === "complete" ? "Opening your workspace…" : canContinue ? "Use this private link" : "Enter my workspace"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Button>}
      <p className="quiet-note login-privacy"><LockKeyhole size={13} aria-hidden="true" />{canContinue && state !== "ready"
        ? "Your sign-in is already active. You can return to your workspace without using another private link."
        : `This private link works once. Keep it for the person it was made for. Sign-in starts only when you choose ${canContinue ? "Use this private link" : "Enter my workspace"}.`}</p>
      {!canContinue && <Link href="/login" className="text-link" prefetch={false}>Sign in with email and password <ArrowUpRight size={14} aria-hidden="true" /></Link>}
    </form>
  );
}
