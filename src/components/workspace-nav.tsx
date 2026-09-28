"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Settings, LogOut, Wallet, ArrowRightLeft, Tags, ChartNoAxesCombined, Target, Repeat2, Banknote } from "lucide-react";
export function WorkspaceNav() {
  const pathname = usePathname();
  return <nav className="nav-links" aria-label="Main navigation">{[{ href: "/dashboard", label: "Overview", mobile: "Overview", Icon: LayoutDashboard }, { href: "/transactions", label: "Transactions", mobile: "Activity", Icon: ArrowRightLeft }, { href: "/budget", label: "Budget", mobile: "Budget", Icon: ChartNoAxesCombined }, { href: "/accounts", label: "Accounts", mobile: "Accounts", Icon: Wallet }, { href: "/goals", label: "Goals", mobile: "Goals", Icon: Target }, { href: "/recurring", label: "Recurring", mobile: "Recurring", Icon: Repeat2 }, { href: "/calendar", label: "Calendar", mobile: "Calendar", Icon: Repeat2 }, { href: "/review", label: "Monthly review", mobile: "Review", Icon: ChartNoAxesCombined }, { href: "/analytics", label: "Analytics", mobile: "Analytics", Icon: ChartNoAxesCombined }, { href: "/retirement", label: "Retirement", mobile: "Retirement", Icon: Banknote }, { href: "/income", label: "Income", mobile: "Income", Icon: Banknote }, { href: "/categories", label: "Categories", mobile: "Categories", Icon: Tags }, { href: "/settings", label: "Settings", mobile: "Settings", Icon: Settings }].map(({ href, label, mobile, Icon }) => <Link key={href} href={href} className={`${(pathname === href || pathname.startsWith(href + "/")) ? "active" : ""} ${(href === "/categories" || href === "/settings" || href === "/recurring" || href === "/income" || href === "/analytics" || href === "/calendar" || href === "/review" || href === "/retirement") ? "mobile-hidden" : ""}`} aria-current={(pathname === href || pathname.startsWith(href + "/")) ? "page" : undefined}><Icon size={19}/><span className="nav-desktop-label">{label}</span><span className="nav-mobile-label">{mobile}</span></Link>)}</nav>;
}
export function Logout() {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error(); router.replace("/login"); router.refresh(); }
    catch { setError("Sign out failed. Please try again."); setBusy(false); }
  }
  return <><button className="logout" disabled={busy} onClick={logout}><LogOut size={17}/>{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="error">{error}</p>}</>;
}
