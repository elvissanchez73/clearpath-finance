import Link from "next/link";
import { pageUser } from "@/server/page-user";
import { ledgerOptions } from "@/server/ledger";
import { calendarView } from "@/server/calendar";
import { monthValue } from "@/lib/ledger-validation";
import { monthBounds } from "@/lib/budget";
import { formatMoney } from "@/lib/finance";
import { MonthToolbar } from "@/components/month-toolbar";
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await pageUser(), options = await ledgerOptions(user.id), params = await searchParams;
  const parsed = monthValue.safeParse(params.month || options.today.slice(0, 7)), month = parsed.success ? parsed.data : options.today.slice(0, 7);
  const view = await calendarView(user.id, month), { start, end } = monthBounds(month);
  const days = Math.round((end.valueOf() - start.valueOf()) / 86400000);
  const kinds: Record<string, string> = { INCOME: "Payday / income", EXPENSE: "Bill / spending", SAVINGS_TRANSFER: "Cash savings", TRANSFER: "Transfer" };
  const states = { planned: "Scheduled", recorded: "Recorded", skipped: "Skipped", removed: "Entry removed" };
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">YOUR MONTH AT A GLANCE</span><h1>Financial calendar</h1><p className="muted">Paydays, bills, subscriptions, and savings in one place.</p></div><Link className="button secondary" href={`/review?month=${month}`}>Monthly review</Link></div><MonthToolbar month={month} path="/calendar"/>
    <div className="calendar-explainer panel"><p><strong>Scheduled is a plan. Recorded is a ledger entry.</strong> Neither confirms a bank payment. Select an item for details.</p><p className="muted">Forecasts use active schedules from their next due date and current settings. They do not recreate earlier plans. Skipped and removed items do not count toward actuals.</p><Link className="text-link" href="/recurring">Manage schedules →</Link></div>
    <div className="calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <span key={d}>{d}</span>)}</div>
    <div className="financial-calendar">{Array.from({ length: start.getUTCDay() }, (_, i) => <div key={`blank-${i}`} className="calendar-blank" aria-hidden="true"/>)}{Array.from({ length: days }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`, events = view.events.filter(e => e.date === date);
      return <section key={date} className={`calendar-day ${date === view.today ? "is-today" : ""}`} aria-label={date}><h2><time dateTime={date}>{i + 1}</time>{date === view.today && <small>Today</small>}</h2>{!events.length && <span className="calendar-no-events">No entries</span>}{events.map(e => <details className={`calendar-event event-${e.state}`} key={e.id}><summary><span className="event-state">{states[e.state]}{e.state === "planned" && e.date < view.today ? " · overdue" : ""}</span><strong>{e.name}</strong><span>{formatMoney(BigInt(e.amount))}</span></summary><div className="event-details"><p>{e.subscription ? "Subscription" : kinds[e.type]}</p><p>{e.account}{e.destination ? ` → ${e.destination}` : ""}</p>{e.category && <p>{e.category}</p>}{e.state === "planned" && <p>{e.autoCreate ? "Automatic ledger entry" : "Waiting for your confirmation"}</p>}{e.note && <p>{e.note}</p>}<Link className="text-link" href={e.state === "recorded" ? `/transactions?from=${date}&to=${date}` : "/recurring"}>{e.state === "recorded" ? "View transactions" : "Manage schedule"}</Link></div></details>)}</section>;
    })}</div>{!view.events.length && <p className="calendar-empty">No entries this month. Add a transaction or create a recurring schedule to populate your calendar.</p>}
  </main>;
}
