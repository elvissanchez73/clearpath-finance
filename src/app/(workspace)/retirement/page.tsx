import { pageUser } from "@/server/page-user";
import { ledgerOptions } from "@/server/ledger";
import { retirementView } from "@/server/retirement";
import { monthValue } from "@/lib/ledger-validation";
import { formatMoney, parseMoney } from "@/lib/finance";
import { MonthToolbar } from "@/components/month-toolbar";
import { RetirementEntries, RetirementSettingsForm } from "@/components/retirement-manager";
export default async function RetirementPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await pageUser(), options = await ledgerOptions(user.id), params = await searchParams;
  const parsed = monthValue.safeParse(params.month || options.today.slice(0, 7)), month = parsed.success ? parsed.data : options.today.slice(0, 7), view = await retirementView(user.id, month);
  const sum = (r: typeof view.monthly) => BigInt(r.employee) + BigInt(r.match) + BigInt(r.other);
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">YOUR LONGER-TERM PICTURE</span><h1>Retirement</h1><p className="muted">Contribution records and planning assumptions, separate from cash savings.</p></div></div><MonthToolbar month={month} path="/retirement"/><div className="summary-grid">{[["Employee this month", formatMoney(BigInt(view.monthly.employee))], ["Employer this month", formatMoney(BigInt(view.monthly.match) + BigInt(view.monthly.other))], ["Total this month", formatMoney(sum(view.monthly))], ["Year through selected month", formatMoney(sum(view.ytd))], ["Reported current balance", view.settings ? formatMoney(parseMoney(view.settings.currentBalance)) : "—"]].map(([label, value]) => <section className="summary-card" key={label}><span>{label}</span><strong>{value}</strong><small>{label === "Reported current balance" ? "Manual snapshot · not historical" : "Actual recorded contributions"}</small></section>)}</div><RetirementEntries records={view.records} today={view.today}/>
    <section className="panel settings-panel"><div className="section-heading"><div><h2>Contribution assumptions</h2><p className="muted">Optional estimates. Employer percentages default to zero.</p></div></div>{view.estimate && <div className="retirement-estimates">{(["employee", "match", "other"] as const).map(key => <div key={key}><strong>{key === "employee" ? "Employee estimate" : key === "match" ? "Employer match estimate" : "Other employer estimate"}</strong><p>{formatMoney(BigInt(view.estimate![key].monthly))} / month</p><small>{formatMoney(BigInt(view.estimate![key].annual))} / year</small></div>)}</div>}<RetirementSettingsForm settings={view.settings}/></section>
  </main>;
}
