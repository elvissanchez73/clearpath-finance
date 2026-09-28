"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { login, registration } from "@/lib/validation";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [show, setShow] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = (mode === "register" ? registration : login).safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) { setError(result.error); return; }
      router.replace(mode === "register" ? "/onboarding" : "/dashboard"); router.refresh();
    } catch { setError("Could not connect. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <><span className="eyebrow">LET&apos;S GET YOU SETTLED</span><h2>{mode === "register" ? "Your fresh start." : "Welcome back."}</h2><p className="muted">{mode === "register" ? "Create your own space for a clearer view of your money." : "Sign in to your personal financial workspace."}</p><form onSubmit={submit} className="form-stack">
    {mode === "register" && <label>Your name<input name="name" autoComplete="name" maxLength={80} required placeholder="Alex Morgan"/></label>}
    <label>Email address<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></label>
    <label>Password<span className="password-field"><input type={show ? "text" : "password"} name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} maxLength={128} required aria-describedby={mode === "register" ? "password-help" : undefined}/><button type="button" className="icon-button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
    {mode === "register" ? <><p id="password-help" className="field-hint">Use at least 12 characters. A memorable phrase works well.</p><label>Confirm password<input type={show ? "text" : "password"} name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={128} required/></label></> : <Link className="forgot-link" href="/forgot-password">Forgot your password?</Link>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="button primary wide" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18}/> Please wait…</> : <>{mode === "register" ? "Create your account" : "Sign in"}<ArrowRight size={18}/></>}</button>
  </form><p className="auth-switch">{mode === "register" ? "Already have an account?" : "New to Clearpath?"} <Link href={mode === "register" ? "/login" : "/signup"}>{mode === "register" ? "Sign in" : "Create an account"}</Link></p></>;
}
