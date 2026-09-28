import Link from "next/link";
import { Brand } from "@/components/brand";
import { Logout, WorkspaceNav } from "@/components/workspace-nav";
import { pageUser } from "@/server/page-user";
import { withOwner } from "@/server/db";
import { LockKeyhole } from "lucide-react";
import { RecurringCatchup } from "@/components/recurring-catchup";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } }));
  children = <><RecurringCatchup key={user.id}/>{children}</>;
  return <div className="workspace" data-theme={settings.theme}><a className="skip-link" href="#workspace-content">Skip to content</a><aside className="sidebar"><Brand/><span className="nav-caption">YOUR WORKSPACE</span><WorkspaceNav/><div className="sidebar-bottom"><div className="privacy-card"><LockKeyhole size={20}/><strong>Just for you.</strong><p>Your financial information stays in your own workspace.</p></div><div className="user-chip"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>Personal account</small></span></div><Logout/></div></aside><div className="workspace-main"><header className="topbar"><span>Personal workspace</span><span className="secure-label"><LockKeyhole size={14}/> Private & secure</span></header><nav className="workspace-quick-links" aria-label="Workspace tools"><Link href="/recurring">Recurring</Link><Link href="/income">Income</Link><Link href="/analytics">Analytics</Link><Link href="/calendar">Calendar</Link><Link href="/review">Review</Link><Link href="/retirement">Retirement</Link><Link href="/categories">Categories</Link><Link href="/settings">Settings</Link></nav><details className="mobile-tools"><summary>More workspace tools</summary><nav aria-label="More navigation">{[["/recurring", "Recurring"], ["/income", "Income"], ["/analytics", "Analytics"], ["/calendar", "Calendar"], ["/review", "Monthly review"], ["/retirement", "Retirement"], ["/categories", "Categories"], ["/settings", "Settings"]].map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav></details><div id="workspace-content" tabIndex={-1}>{children}</div></div></div>;
}
