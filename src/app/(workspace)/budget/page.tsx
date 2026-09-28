import Link from "next/link";
import { ArrowRight, Repeat2, CircleDollarSign, Wallet, PiggyBank } from "lucide-react";
import { pageUser } from "@/server/page-user";
import { withOwner } from "@/server/db";
import { budgetView } from "@/server/budgets";
import { monthValue, todayInZone } from "@/lib/ledger-validation";
import { monthBounds } from "@/lib/budget";
import { formatMoney } from "@/lib/finance";
import { BudgetActions } from "@/components/budget-editor";
import { MonthToolbar } from "@/components/month-toolbar";
import { CategoryIcon } from "@/components/ledger-ui";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await pageUser();
  const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } }));
  const params = await searchParams, parsed = monthValue.safeParse(params.month || todayInZone(settings.timezone).slice(0, 7));
  const month = parsed.success ? parsed.data : todayInZone(settings.timezone).slice(0, 7), view = await budgetView(user.id, month);
  const end = new Date(monthBounds(month).end.valueOf() - 86400000).toISOString().slice(0, 10);
  const drill = (category: string | null) => `/transactions?${new URLSearchParams({ type: "EXPENSE", category: category || "uncategorized", from: `${month}-01`, to: end })}`;
  const money = (value: string) => formatMoney(BigInt(value));
  const comparison = [
    { label: "Net income", planned: view.plan?.incomeMinor, actual: view.actual.incomeMinor },
    { label: "Spending", planned: view.totals?.allocatedMinor, actual: view.actual.expensesMinor },
    { label: "Cash savings", planned: view.plan?.savingsMinor, actual: view.actual.savingsMinor },
    { label: "Remaining", planned: view.totals?.plannedRemainderMinor, actual: view.actual.remainingMinor },
  ];
  return <main className="page budget-page">
    <div className="page-heading"><div><span className="eyebrow">GIVE YOUR MONTH A PLAN</span><h1>Monthly budget</h1><p className="muted">Make room for your everyday spending and what comes next.</p></div><BudgetActions key={`${month}-${view.plan?.revision}`} view={view}/></div>
    <MonthToolbar month={month} path="/budget"/>
    {!parsed.success && <p className="notice error" role="alert">That month is invalid. Showing the current month.</p>}
    {view.plan && view.totals ? <div className="summary-grid budget-summary">
      <section className="summary-card featured"><div><span>Remaining to spend</span><Wallet size={18}/></div><strong>{money(view.totals.remainingToSpendMinor)}</strong><small>Planned income − actual spending − planned savings</small></section>
      <section className="summary-card"><div><span>Spending allocated</span><CircleDollarSign size={18}/></div><strong>{money(view.totals.allocatedMinor)}</strong><small>{view.plan.items.length} category allocations</small></section>
      <section className={`summary-card ${BigInt(view.totals.plannedRemainderMinor) < 0n ? "budget-warning" : ""}`}><div><span>{BigInt(view.totals.plannedRemainderMinor) < 0n ? "Plan exceeds income" : "Left to allocate"}</span><PiggyBank size={18}/></div><strong>{money(BigInt(view.totals.plannedRemainderMinor) < 0n ? (-BigInt(view.totals.plannedRemainderMinor)).toString() : view.totals.plannedRemainderMinor)}</strong><small>Planned income − allocations − planned savings</small></section>
    </div> : <section className="first-step"><div><span className="eyebrow">A FRESH MONTH</span><h2>No budget set for this month.</h2><p>Create a plan or copy a previous month. Your recorded spending appears below, even before you set limits.</p></div><CircleDollarSign size={46}/></section>}
    <section className="panel budget-comparison"><div className="activity-heading"><h2>Plan versus actual</h2><span className="muted">USD · selected month</span></div><table><thead><tr><th scope="col">Cash flow</th><th scope="col">Budget</th><th scope="col">Actual</th></tr></thead><tbody>{comparison.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.planned === undefined ? "—" : money(row.planned)}</td><td>{money(row.actual)}</td></tr>)}</tbody></table><p className="budget-footnote">Actual remaining = recorded net income − expenses − savings transfers. Ordinary transfers never count as spending. Remaining to spend above uses your planned income and savings.</p></section>
    <div className="list-toolbar"><h2 className="budget-section-title">Category spending</h2><Link className="text-link" href="/categories">Manage categories<ArrowRight size={15}/></Link></div>
    {view.rows.length ? <div className="budget-category-grid">{view.rows.map(row => {
      const planned = BigInt(row.plannedMinor), spent = BigInt(row.actualMinor), remaining = BigInt(row.remainingMinor);
      const percent = planned > 0n ? spent * 100n / planned : null;
      const progress = percent === null ? (spent > 0n ? 100 : 0) : Number(percent > 100n ? 100n : percent);
      const over = remaining < 0n && row.allocated;
      return <article className={`panel budget-category ${over ? "is-over" : ""}`} key={row.categoryId || "uncategorized"}>
        <div className="category-title"><span className="feature-icon"><CategoryIcon name={row.icon}/></span><div><h3>{row.name}</h3><small className="muted">{row.archived ? "Archived category" : row.allocated ? "Monthly allocation" : "No allocation"}</small></div>{row.recurring && <span className="repeat-badge" title="Marked for recurring-item copies"><Repeat2 size={16}/><span className="sr-only">Repeating allocation</span></span>}</div>
        <div className="budget-used"><strong>{money(row.actualMinor)}</strong><span>of {row.allocated ? money(row.plannedMinor) : "no budget"}</span></div>
        <div className="budget-meter" role="meter" aria-label={`${row.name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={percent === null ? (spent > 0n ? "Spending without a positive budget" : "No spending") : `${percent}% used`}><span style={{ width: `${progress}%` }}/></div>
        <div className="budget-status"><span>{percent === null ? "No percentage available" : `${percent}% used`}</span><strong>{row.allocated ? `${money(over ? (-remaining).toString() : row.remainingMinor)} ${over ? "over budget" : "remaining"}` : "Unbudgeted spending"}</strong></div>
        <Link className="text-link" href={drill(row.categoryId)}>View expenses<ArrowRight size={15}/></Link>
      </article>;
    })}</div> : <section className="panel empty-state"><CircleDollarSign size={33}/><h2>Your categories will appear here</h2><p className="muted">Allocate spending in your budget or record an expense to start comparing your plan with reality.</p><Link className="text-link" href="/transactions">Go to transactions<ArrowRight size={15}/></Link></section>}
  </main>;
}
