"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PasswordSettings({ canChoosePasswordAfterLink = false }: { canChoosePasswordAfterLink?: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [passwordChosen, setPasswordChosen] = useState(false);
  const [useCurrentPassword, setUseCurrentPassword] = useState(false);
  const setupMode = canChoosePasswordAfterLink && !passwordChosen && !useCurrentPassword;
  const pending = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError(null); setSaved(false);
    if ([...newPassword].length < 12 || newPassword.length > 128 || newPassword !== confirmPassword || (!setupMode && newPassword === currentPassword)) {
      setError(setupMode ? "Use a password of 12–128 characters and make sure both passwords match." : "Use a different password of 12–128 characters and make sure the new passwords match.");
      requestAnimationFrame(() => statusRef.current?.focus());
      return;
    }
    pending.current = true; setBusy(true);
    try {
      const response = await fetch(setupMode ? "/api/account/password/setup" : "/api/account/password", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupMode ? { newPassword, confirmPassword } : { currentPassword, newPassword, confirmPassword }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("changed" in data) || data.changed !== true) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Your password could not be updated. Please try again.";
        throw new Error(message);
      }
      if (setupMode) setPasswordChosen(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your password could not be updated. Please try again.");
    } finally {
      pending.current = false; setBusy(false);
      requestAnimationFrame(() => statusRef.current?.focus());
    }
  }
  return <Card id="account-password" role="region" tabIndex={-1} aria-labelledby="account-password-heading" className="settings-card password-settings">
    <div className="section-heading"><h2 id="account-password-heading">Your password</h2><KeyRound size={19} aria-hidden="true" /></div>
    <p>{setupMode ? "Your recent private sign-in confirms it’s you. Choose a password to return with your email." : "Choose a password only you know. Enter your current password first, including your temporary one if this is your first visit."}</p>
    <form className="access-form password-form" onSubmit={changePassword} aria-busy={busy}>
      {!setupMode && <>
        <label className="form-label" htmlFor="account-current-password">Current password</label>
        <Input id="account-current-password" name="current-password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setSaved(false); }} />
      </>}
      <label className="form-label" htmlFor="account-new-password">New password</label>
      <Input id="account-new-password" name="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setSaved(false); }} aria-describedby="account-password-help" />
      <label className="form-label" htmlFor="account-confirm-password">Confirm new password</label>
      <Input id="account-confirm-password" name="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setSaved(false); }} />
      <p id="account-password-help" className="quiet-note">Use 12–128 characters. A unique passphrase or a password manager can help.</p>
      <Button type="submit" disabled={busy}>{setupMode ? busy ? "Setting password…" : "Set my password" : busy ? "Changing password…" : "Change my password"}</Button>
      {setupMode && <Button type="button" variant="ghost" disabled={busy} onClick={() => {
        setUseCurrentPassword(true); setError(null);
        requestAnimationFrame(() => document.getElementById("account-current-password")?.focus());
      }}>Use my current password instead</Button>}
      <p ref={statusRef} tabIndex={-1} role={error ? "alert" : "status"} aria-live="polite" className={error ? "form-error" : "access-status"}>{error ?? (saved ? passwordChosen ? "Your password is set. Next time, sign in with your email and this password." : "Your password has been changed. Use your new password next time you sign in." : "")}</p>
      {saved && <p className="quiet-note"><Link href="/">Open my workspace</Link> and bookmark that page for your next visit.</p>}
    </form>
  </Card>;
}
