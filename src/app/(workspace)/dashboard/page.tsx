import { WorkspaceNudges } from "@/components/workspace-nudges";
import { AnalyticsCharts } from "@/components/analytics-charts";
import { analyticsView } from "@/server/analytics";
import { MonthToolbar } from "@/components/month-toolbar";
import Link from "next/link";
import { BudgetSnapshot } from "@/components/budget-snapshot";
import { ArrowRight, Wallet, ArrowRightLeft, Vault } from "lucide-react";
import { pageUser } from "@/server/page-user";
import { ledgerOptions, ledgerOverview } from "@/server/ledger";
import { monthValue } from "@/lib/ledger-validation";
import { formatMoney } from "@/lib/finance";
import { AddTransaction } from "@/components/transaction-form";
import { TransactionList } from "@/components/transaction-list";
import type { AccountView } from "@/lib/ledger-types";

const everydayAccountTypes = new Set(["CHECKING", "SAVINGS", "CASH"]);
const reserveAccountTypes = new Set(["HYSA", "INVESTMENT"]);
const accountTypeLabel = (type: string) => type === "HYSA" ? "HYSA" : type.toLowerCase().replaceAll("_", " ");
const totalBalance = (accounts: AccountView[]) => accounts.reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n);
const savingsRate = (rate: bigint | null) => rate === null ? "No income recorded" : `${rate / 100n}.${(rate % 100n).toString().padStart(2, "0")}% savings rate`;

function AccountGroup({ title, accounts, empty }: { title: string; accounts: AccountView[]; empty: string }) {
  return <div className="account-focus-group"><div><h3>{title}</h3><strong>{formatMoney(totalBalance(accounts))}</strong></div>{accounts.length ? accounts.map(account => <Link className="account-focus-row" href="/accounts" key={account.id}><span><Wallet size={17}/>{account.name}</span><small>{accountTypeLabel(account.type)}</small><strong>{formatMoney(BigInt(account.balanceMinor))}</strong></Link>) : <p className="muted">{empty}</p>}</div>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await pageUser(), options = await ledgerOptions(user.id), params = await searchParams;
  const selection = monthValue.safeParse(params.month || options.today.slice(0, 7));
  const month = selection.success ? selection.data : options.today.slice(0, 7);
  const overview = await ledgerOverview(user.id, month);
  const current = new Date(month + "-01T00:00:00Z");
  const analytics = await analyticsView(user.id, { month, range: "6" });
  const activeAccounts = options.accounts.filter(account => !account.archived);
  const everydayAccounts = activeAccounts.filter(account => everydayAccountTypes.has(account.type));
  const reserveAccounts = activeAccounts.filter(account => reserveAccountTypes.has(account.type));
  const otherAccounts = activeAccounts.filter(account => !everydayAccountTypes.has(account.type) && !reserveAccountTypes.has(account.type));
  const cards = [
    { label: "Everyday cash", value: formatMoney(totalBalance(everydayAccounts)), icon: Wallet, detail: "Checking, savings, and cash you actually use", featured: true },
    { label: "HYSA and reserves", value: formatMoney(totalBalance(reserveAccounts)), icon: Vault, detail: "Set-aside money you do not plan to touch" },
    { label: "This month flow", value: formatMoney(overview.remaining), icon: ArrowRightLeft, detail: savingsRate(overview.rate) },
  ];
  return <main className="page">
    <div className="page-heading"><div><span className="eyebrow">YOUR FINANCIAL PICTURE</span><h1>Hello, {user.name.split(" ")[0]}.</h1><p className="muted">A simpler view of usable cash, set-aside money, and this month&apos;s movement.</p></div><AddTransaction options={options}/></div>
    <WorkspaceNudges userId={user.id}/>
    <MonthToolbar month={month} path="/dashboard"/>
    {!options.accounts.length && <section className="first-step"><div><span className="eyebrow">START HERE</span><h2>Bring your first account into view.</h2><p>Start with the balance in your checking or savings account, then add transactions as they happen.</p></div><Link className="button lime" href="/accounts">Add your first account<ArrowRight size={17}/></Link></section>}
    <div className="summary-grid dashboard-summary">{cards.map(({ label, value, icon: Icon, detail, featured }) => <section key={label} className={`summary-card ${featured ? "featured" : ""}`}><div><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small></section>)}</div>
    <section className="panel account-focus"><div className="activity-heading"><div><h2>Account view</h2><p className="muted">Your savings account can stay in everyday cash while HYSA stays separated.</p></div><Link className="text-link" href="/accounts">Manage</Link></div><div className="account-focus-grid"><AccountGroup title="Everyday" accounts={everydayAccounts} empty="No checking, savings, or cash accounts yet."/><AccountGroup title="Set aside" accounts={reserveAccounts} empty="No HYSA or investment accounts yet."/>{otherAccounts.length > 0 && <AccountGroup title="Other" accounts={otherAccounts} empty="No other active accounts."/>}</div></section>
    <BudgetSnapshot userId={user.id} month={month}/>
    <div className="overview-grid simplified-overview"><section className="panel activity-panel"><div className="activity-heading"><div><h2>Recent activity</h2><p className="muted">{formatMoney(overview.income)} in, {formatMoney(overview.expenses)} spent, {formatMoney(overview.savings)} saved this month.</p></div><Link className="text-link" href={`/transactions?from=${month}-01&to=${new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)}`}>View all<ArrowRight size={16}/></Link></div><TransactionList records={overview.recent} options={options} editable={false}/></section><details className="panel dashboard-details"><summary><span>Trends and categories</span><small>Open when you want charts.</small></summary><AnalyticsCharts view={analytics} compact/></details></div>
  </main>;
}