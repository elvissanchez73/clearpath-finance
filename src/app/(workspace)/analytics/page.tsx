import { pageUser } from "@/server/page-user";
import { withOwner } from "@/server/db";
import { analyticsView } from "@/server/analytics";
import { analyticsInput } from "@/lib/analytics";
import { todayInZone } from "@/lib/ledger-validation";
import { formatMoney } from "@/lib/finance";
import { AnalyticsCharts } from "@/components/analytics-charts";
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ month?: string; range?: string; account?: string }> }) {
  const user = await pageUser(), params = await searchParams;
  const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } }));
  const month = todayInZone(settings.timezone).slice(0, 7);
  const parsed = analyticsInput.safeParse({ month: params.month || month, range: params.range || "6", account: params.account || "" });
  const filter = parsed.success ? parsed.data : analyticsInput.parse({ month });
  // Only offer owned account choices; stale/deleted links fall back to the aggregate.
  if (filter.account && !await withOwner(user.id, tx => tx.account.count({ where: { id: filter.account, userId: user.id } }))) filter.account = "";
  const view = await analyticsView(user.id, filter);
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">PATTERNS OVER TIME</span><h1>Analytics</h1><p className="muted">Follow your money. Understand your progress.</p></div></div>
    <form action="/analytics" className="analytics-filters"><label>Through month<input type="month" name="month" min="1900-01" max="9999-12" defaultValue={filter.month} required/></label><label>Range<select name="range" defaultValue={filter.range}>{[["1", "1 month"], ["3", "3 months"], ["6", "6 months"], ["12", "1 year"], ["all", "All time"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Balance history account<select name="account" defaultValue={filter.account}><option value="">All accounts</option>{view.accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (archived)" : ""}</option>)}</select></label><button className="button primary">Apply</button></form>
    <p className="muted analytics-period">{view.start} through {view.end} · The account selector changes only balance history. Current-month totals are partial. {view.yearly && "Ranges longer than ten years use annual chart points."}</p>
    <div className="summary-grid">{([["Net income", view.totals.income], ["Spending", view.totals.expenses], ["Cash saved", view.totals.savings], ["Net cash flow", view.totals.remaining]] as const).map(([label, value]) => <section className="summary-card" key={label}><span>{label}</span><strong>{formatMoney(BigInt(value))}</strong><small>Selected range</small></section>)}</div>
    <AnalyticsCharts view={view}/>
  </main>;
}
