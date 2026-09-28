"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, LockKeyhole, Monitor, Moon, Sun } from "lucide-react";
import { changePassword, preferences, profile } from "@/lib/validation";
import type { ZodType } from "zod";

function useSave() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false);
  const router = useRouter();
  async function save(event: FormEvent<HTMLFormElement>, endpoint: string, method: string, schema: ZodType, success: string, reset = false) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    setMessage(""); setError(false);
    if (!parsed.success) { setMessage(parsed.error.issues[0].message); setError(true); return; }
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) { setError(true); setMessage(result.error); return; }
      setMessage(success); if (reset) form.reset(); router.refresh();
    } catch { setMessage("Could not connect. Please try again."); setError(true); }
    finally { setBusy(false); }
  }
  return { busy, save, feedback: message ? <p role={error ? "alert" : "status"} className={`notice ${error ? "error" : "success"}`}>{!error && <Check size={16}/>} {message}</p> : null };
}
function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) { return <button className="button primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin"/>}{busy ? "Saving…" : children}</button>; }
export function ProfileForm({ name, email }: { name: string; email: string }) {
  const { save, busy, feedback } = useSave();
  return <form className="settings-form" onSubmit={e => save(e, "/api/profile", "PATCH", profile, "Your profile has been updated.")}><div className="field-grid"><label>Your name<input name="name" defaultValue={name} maxLength={80} required autoComplete="name"/></label><div className="read-only-field"><span>Email address</span><p>{email}</p><small>Your sign-in email</small></div></div>{feedback}<div className="form-actions"><Submit busy={busy}>Save profile</Submit></div></form>;
}
export function PreferencesForm({ id, theme, timezone }: { id: string; theme: string; timezone: string }) {
  const { save, busy, feedback } = useSave();
  return <form className="settings-form" onSubmit={e => save(e, `/api/workspace/settings/${id}`, "PATCH", preferences, "Your preferences have been saved.")}><fieldset className="theme-field"><legend>Appearance</legend><div className="theme-options">{[{ value: "light", label: "Light", Icon: Sun }, { value: "dark", label: "Dark", Icon: Moon }, { value: "system", label: "System", Icon: Monitor }].map(({ value, label, Icon }) => <label key={value}><input type="radio" name="theme" value={value} defaultChecked={theme === value}/><span><Icon size={20}/>{label}</span></label>)}</div></fieldset><div className="field-grid"><label>Time zone<input name="timezone" defaultValue={timezone} maxLength={80} required placeholder="America/La_Paz" list="timezones"/><datalist id="timezones"><option value="UTC"/><option value="America/La_Paz"/><option value="America/New_York"/><option value="America/Los_Angeles"/><option value="Europe/London"/></datalist></label><div className="read-only-field"><span>Workspace currency</span><p>USD · US dollar</p><small>All accounts use the same currency.</small></div></div>{feedback}<div className="form-actions"><Submit busy={busy}>Save preferences</Submit></div></form>;
}
export function PasswordForm() {
  const { save, busy, feedback } = useSave();
  return <form className="settings-form" onSubmit={e => save(e, "/api/auth/change-password", "POST", changePassword, "Password changed. All other sessions have been signed out.", true)}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required/></label><div className="field-grid"><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-describedby="new-password-help"/></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label></div><p className="field-hint" id="new-password-help">Use 12–128 characters. Changing your password signs out your other sessions.</p>{feedback}<div className="form-actions"><span className="muted inline"><LockKeyhole size={15}/> Your password is never stored as plain text.</span><Submit busy={busy}>Update password</Submit></div></form>;
}
