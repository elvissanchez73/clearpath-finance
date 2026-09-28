import Link from "next/link";
import { pageUser } from "@/server/page-user";
import { ledgerOptions } from "@/server/ledger";
import { recurringView } from "@/server/recurring";
import { incomeView } from "@/server/income";
import { monthValue } from "@/lib/ledger-validation";
import { monthBounds } from "@/lib/budget";
import { formatMoney } from "@/lib/finance";
import { MonthToolbar } from "@/components/month-toolbar";
import { IncomePlan } from "@/components/income-plan";
import { RecurringManager } from "@/components/recurring-manager";
import { AddTransaction } from "@/components/transaction-form";
export default async function IncomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await pageUser(), options = await ledgerOptions(user.id), params = await searchParams;
  const parsed = monthValue.safeParse(params.month || options.today.slice(0, 7)), month = parsed.success ? parsed.data : options.today.slice(0, 7);
  const view = await incomeView(user.id, month), end = new Date(monthBounds(month).end.valueOf() - 86400000).toISOString().slice(0, 10);
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">THE MONEY COMING IN</span><h1>Income</h1><p className="muted">Keep expected pay and money actually received in clear view.</p></div><AddTransaction options={options} initialType="INCOME"/></div><MonthToolbar month={month} path="/income"/><div className="summary-grid"><section className="summary-card featured"><div>Actual net income</div><strong>{formatMoney(BigInt(view.actualNetMinor))}</strong><small>{view.count} recorded income entries</small></section><section className="summary-card"><div>Documented gross income</div><strong>{formatMoney(BigInt(view.documentedGrossMinor))}</strong><small>{view.documentedCount} entries include payroll details</small></section><section className="summary-card"><div>Documented deductions</div><strong>{formatMoney(BigInt(view.documentedDeductionsMinor))}</strong><small>Only deductions explicitly recorded</small></section></div><p className="income-history-link"><Link className="text-link" href={`/transactions?type=INCOME&from=${month}-01&to=${end}`}>View this month’s income transactions →</Link></p><IncomePlan view={view}/><RecurringManager compact kind="income" options={options} view={await recurringView(user.id)}/></main>;
}
