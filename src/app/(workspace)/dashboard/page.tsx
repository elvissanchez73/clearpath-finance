import { WorkspaceNudges } from "@/components/workspace-nudges";
import { AnalyticsCharts } from "@/components/analytics-charts";
import { analyticsView } from "@/server/analytics";
import { MonthToolbar } from "@/components/month-toolbar";
import Link from "next/link";
import { BudgetSnapshot } from "@/components/budget-snapshot";
import { ArrowRight, ArrowDownLeft, ArrowUpRight, Wallet, PiggyBank, ArrowRightLeft, Percent } from "lucide-react";
import { pageUser } from "@/server/page-user";
import { ledgerOptions, ledgerOverview } from "@/server/ledger";
import { monthValue } from "@/lib/ledger-validation";
import { formatMoney } from "@/lib/finance";
import { AddTransaction } from "@/components/transaction-form";
import { TransactionList } from "@/components/transaction-list";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await pageUser(), options = await ledgerOptions(user.id), params = await searchParams;
  const selection = monthValue.safeParse(params.month || options.today.slice(0, 7));
  const month = selection.success ? selection.data : options.today.slice(0, 7);
  const overview = await ledgerOverview(user.id, month);
  const current = new Date(month + "-01T00:00:00Z");
  const analytics = await analyticsView(user.id, { month, range: "6" });
  const balance = options.accounts.reduce((sum, a) => sum + BigInt(a.balanceMinor), 0n);
  const cards = [
    { label: "Net account balance", value: formatMoney(balance), icon: Wallet, detail: "All accounts · current", featured: true },
    { label: "Income", value: formatMoney(overview.income), icon: ArrowDownLeft, detail: "Net cash received" },
    { label: "Spending", value: formatMoney(overview.expenses), icon: ArrowUpRight, detail: "Transfers excluded" },
    { label: "Cash saved", value: formatMoney(overview.savings), icon: PiggyBank, detail: "Savings transfers" },
    { label: "Net cash flow", value: formatMoney(overview.remaining), icon: ArrowRightLeft, detail: "Income − spending − savings" },
    { label: "Savings rate", value: overview.rate === null ? "—" : `${overview.rate / 100n}.${(overview.rate % 100n / 10n)}%`, icon: Percent, detail: overview.rate === null ? "No income recorded" : "Cash saved ÷ net income" },
  ];
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">YOUR FINANCIAL PICTURE</span><h1>Hello, {user.name.split(" ")[0]}.</h1><p className="muted">Know where you stand. Decide what comes next.</p></div><AddTransaction options={options}/></div><WorkspaceNudges userId={user.id}/><MonthToolbar month={month} path="/dashboard"/>{!options.accounts.length && <section className="first-step"><div><span className="eyebrow">START HERE</span><h2>Bring your first account into view.</h2><p>Start with the balance in your checking or savings account, then add transactions as they happen.</p></div><Link className="button lime" href="/accounts">Add your first account<ArrowRight size={17}/></Link></section>}<div className="summary-grid">{cards.map(({ label, value, icon: Icon, detail, featured }) => <section key={label} className={`summary-card ${featured ? "featured" : ""}`}><div><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small></section>)}</div><BudgetSnapshot userId={user.id} month={month}/><AnalyticsCharts view={analytics} compact/><div className="overview-grid"><section className="panel activity-panel"><div className="activity-heading"><h2>Recent activity</h2><Link className="text-link" href={`/transactions?from=${month}-01&to=${new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)}`}>View all<ArrowRight size={16}/></Link></div><TransactionList records={overview.recent} options={options} editable={false}/></section><section className="panel overview-accounts"><div className="activity-heading"><h2>Your accounts</h2><Link className="text-link" href="/accounts">Manage</Link></div>{options.accounts.filter(a => !a.archived).slice(0, 5).map(account => <div className="mini-account" key={account.id}><span><Wallet size={18}/>{account.name}</span><strong>{formatMoney(BigInt(account.balanceMinor))}</strong></div>)}{!options.accounts.some(a => !a.archived) && <p className="muted">Your active account balances will appear here.</p>}<div className="ledger-explainer"><ArrowRightLeft size={19}/><p>Moving money between your accounts changes their balances, without adding to your spending.</p></div></section></div></main>;
}
