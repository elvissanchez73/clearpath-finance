"use client";
import { useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsView } from "@/lib/analytics";
import { formatMoney } from "@/lib/finance";

const colors = ["#248477", "#d68555", "#7289c3", "#ac74ac"];
const progressValue = (current: string, target: string) => Math.min(100, Number(BigInt(current) * 10000n / BigInt(target)) / 100);
const money = (v: string) => formatMoney(BigInt(v));
const percent = (v: string | null) => v === null ? "—" : `${Number(v) / 100}%`;
type Series = { key: string; name: string };
type Datum = { label: string; exact: Record<string, string | null>; [key: string]: string | number | null | Record<string, string | null> };
const axisMoney = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(v);
function Chart({ title, description, data, series, bars = false, rate = false }: { title: string; description: string; data: Datum[]; series: Series[]; bars?: boolean; rate?: boolean }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = series.filter(s => !hidden.includes(s.key));
  return <section className="panel analytics-card"><h2>{title}</h2><p className="muted chart-description">{description}</p>
    {series.length > 1 && <div className="chart-toggles" aria-label={`${title} series`}>{series.map((s, i) => <button key={s.key} type="button" aria-pressed={!hidden.includes(s.key)} onClick={() => setHidden(h => h.includes(s.key) ? h.filter(k => k !== s.key) : h.length < series.length - 1 ? [...h, s.key] : h)}><span style={{ background: colors[i % colors.length] }}/>{s.name}</button>)}</div>}
    {!data.length ? <p className="chart-empty">No records yet. Add transactions or a budget to see this view.</p> : <>
      <div className="chart-canvas" role="group" aria-label={`${title}. Exact values available in the data table below.`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {bars ? <BarChart data={data} accessibilityLayer margin={{ top: 12, right: 12, left: 10, bottom: 20 }}>
            <CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={v => String(v).length > 16 ? String(v).slice(0, 14) + "…" : String(v)}/><YAxis width={65} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={axisMoney}/><ReferenceLine y={0} stroke="var(--muted)"/>
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><strong>{label}</strong>{payload.map(p => <div key={String(p.dataKey)}>{p.name}: {money((p.payload as Datum).exact[String(p.dataKey)] ?? "0")}</div>)}</div> : null}/>
            {visible.map(s => <Bar key={s.key} dataKey={s.key} name={s.name} fill={colors[series.indexOf(s) % colors.length]} radius={[4, 4, 0, 0]} isAnimationActive={false}/>)}
          </BarChart> : <LineChart data={data} accessibilityLayer margin={{ top: 12, right: 16, left: 10, bottom: 12 }}>
            <CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="label" minTickGap={28} tick={{ fill: "var(--muted)", fontSize: 11 }}/><YAxis width={65} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={v => rate ? `${v}%` : axisMoney(v)}/><ReferenceLine y={0} stroke="var(--muted)"/>
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><strong>{label}</strong>{payload.map(p => <div key={String(p.dataKey)}>{p.name}: {rate ? percent((p.payload as Datum).exact[String(p.dataKey)]) : money((p.payload as Datum).exact[String(p.dataKey)] ?? "0")}</div>)}</div> : null}/><Legend/>
            {visible.map(s => <Line key={s.key} dataKey={s.key} name={s.name} stroke={colors[series.indexOf(s) % colors.length]} strokeWidth={2.5} dot={data.length < 14} connectNulls={false} isAnimationActive={false}/>)}
          </LineChart>}
        </ResponsiveContainer>
      </div>
      <details className="chart-data"><summary>View exact data</summary><div className="chart-table-scroll" tabIndex={0}><table><caption className="sr-only">{title}</caption><thead><tr><th scope="col">Period / item</th>{series.map(s => <th scope="col" key={s.key}>{s.name}</th>)}</tr></thead><tbody>{data.map((r, i) => <tr key={`${r.label}-${i}`}><th scope="row">{r.label}</th>{series.map(s => <td key={s.key}>{r.exact[s.key] === null ? "—" : rate ? percent(r.exact[s.key]) : money(r.exact[s.key] ?? "0")}</td>)}</tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
function trendData(view: AnalyticsView): Datum[] { return view.points.map(p => ({ label: p.period, exact: { income: p.income, expenses: p.expenses, savings: p.savings, remaining: p.remaining, rate: p.rate, balance: p.balance }, income: Number(p.income) / 100, expenses: Number(p.expenses) / 100, savings: Number(p.savings) / 100, remaining: Number(p.remaining) / 100, rate: p.rate === null ? null : Number(p.rate) / 100, balance: Number(p.balance) / 100 })); }
export function AnalyticsCharts({ view, compact = false }: { view: AnalyticsView; compact?: boolean }) {
  const data = trendData(view), period = view.yearly ? "Annual totals; first and last years may be partial." : "Monthly totals, including months without activity.";
  const categories: Datum[] = view.categories.slice(0, 10).map(c => ({ label: c.name, exact: { amount: c.amount, planned: c.planned }, amount: Number(c.amount) / 100, planned: c.planned === null ? null : Number(c.planned) / 100 }));
  return <><div className="analytics-grid">
    <Chart title="Income, spending & savings" description={`${period} Transfers are excluded from spending; cash saved counts savings transfers.`} data={data} series={[{ key: "income", name: "Income" }, { key: "expenses", name: "Spending" }, { key: "savings", name: "Cash saved" }]}/>
    <Chart title="Spending by category" description="Largest 10 categories in the selected range. Only expenses are included." data={categories.filter(c => Number(c.amount) > 0)} bars series={[{ key: "amount", name: "Spent" }]}/>
    {!compact && <>
      <Chart title="Budget vs actual" description={`${view.plannedMonths} months with a saved budget. Largest 10 spending categories; a dash means no allocation. Actuals include all selected months.`} data={categories} bars series={[{ key: "planned", name: "Budgeted" }, { key: "amount", name: "Spent" }]}/>
      <Chart title="Savings rate trend" description="Cash saved ÷ net income. Gaps mean no income was recorded; rates may exceed 100%." data={data} rate series={[{ key: "rate", name: "Savings rate" }]}/>
      <Chart title="Net cash flow" description="Net income minus spending and cash savings transfers. Negative values mean outflow exceeded income." data={data} series={[{ key: "remaining", name: "Net cash flow" }]}/>
      <Chart title="Account balance history" description={`${view.filter.account ? view.accounts.find(a => a.id === view.filter.account)?.name : "All accounts, including archived"}. Reconstructed period-end balances from today's starting balances and recorded transactions; not verified historical bank balances. ${view.yearly ? "Annual points." : "Monthly points."}`} data={data} series={[{ key: "balance", name: "Balance" }]}/>
      <section className="panel analytics-card"><h2>Goal progress</h2><p className="muted chart-description">Current progress, independent of the selected historical range.</p>{!view.goals.length && <p className="chart-empty">Create a savings goal to track your progress.</p>}<div className="analytics-goals">{view.goals.map(g => <Link href="/goals" key={g.id}><div><strong>{g.name}</strong><small>{g.status.toLowerCase()}</small></div><p>{money(g.current)}{g.target ? ` of ${money(g.target)}` : " · No target set"}</p>{g.target && BigInt(g.target) > 0n && <progress aria-label={`${g.name} progress`} max={100} value={progressValue(g.current, g.target)}/>}</Link>)}</div></section>
      <section className="panel analytics-card"><h2>Every category</h2><p className="muted chart-description">Exact totals and transaction drill-down for all categories, including archived and uncategorized expenses.</p><div className="chart-table-scroll" tabIndex={0}><table><thead><tr><th scope="col">Category</th><th scope="col">Budgeted</th><th scope="col">Spent</th></tr></thead><tbody>{view.categories.map(c => <tr key={c.id}><th scope="row"><Link className="text-link" href={`/transactions?type=EXPENSE&category=${c.id}&from=${view.start}-01&to=${new Date(Date.UTC(Number(view.end.slice(0, 4)), Number(view.end.slice(5)), 0)).toISOString().slice(0, 10)}`}>{c.name}</Link></th><td>{c.planned === null ? "—" : money(c.planned)}</td><td>{money(c.amount)}</td></tr>)}</tbody></table></div>{!view.categories.length && <p className="muted">No spending or category budgets in this range.</p>}</section>
    </>}
  </div>{compact && <Link className="text-link analytics-more" href={`/analytics?month=${view.end}&range=6`}>Explore all analytics →</Link>}</>;
}
