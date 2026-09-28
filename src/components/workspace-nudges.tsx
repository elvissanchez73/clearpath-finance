import Link from "next/link";
import { withOwner } from "@/server/db";
import { todayInZone } from "@/lib/ledger-validation";
export async function WorkspaceNudges({ userId }: { userId: string }) {
  const view = await withOwner(userId, async tx => { const s = await tx.userSettings.findUniqueOrThrow({ where: { userId } }); const due = s.notificationsEnabled ? await tx.recurringTransaction.count({ where: { userId, active: true, nextDueDate: { lte: new Date(todayInZone(s.timezone)) } } }) : 0; return { complete: s.onboardingComplete, due }; });
  return <div className="workspace-nudges">{!view.complete && <div className="setup-nudge"><span>Make this workspace yours, one step at a time.</span><Link className="text-link" href="/onboarding">Continue setup →</Link></div>}{view.due > 0 && <div className="setup-nudge"><span>{view.due} recurring {view.due === 1 ? "schedule is" : "schedules are"} due or overdue.</span><Link className="text-link" href="/recurring">Review due entries →</Link></div>}</div>;
}
