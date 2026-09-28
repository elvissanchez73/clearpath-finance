import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
export default function ForgotPassword() { return <AuthFrame><span className="eyebrow">ACCOUNT RECOVERY</span><h2>Need a hand?</h2><p className="muted">Email password recovery isn&apos;t available in this installation yet. If you&apos;re still signed in, you can change your password in Settings.</p><div className="form-stack"><Link className="button primary" href="/settings">Go to settings</Link><Link className="button secondary" href="/login">Back to sign in</Link></div></AuthFrame>; }
