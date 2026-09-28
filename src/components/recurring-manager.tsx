"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Repeat2, CalendarDays, ArrowRight, RefreshCw } from "lucide-react";
import { recurringInput, frequencies, frequencyLabel, type RecurringView, type ScheduleFrequency } from "@/lib/recurring";
import { transactionTypes } from "@/lib/ledger-validation";
import { typeLabel, type LedgerOptions } from "@/lib/ledger-types";
import { formatMoney, parseMoney } from "@/lib/finance";
import { Modal, ErrorMessage, SaveButton } from "./ledger-ui";
type View = { records: RecurringView[]; today: string; subscriptionAnnualMinor: string; subscriptionMonthlyMinor: string };
type Kind = "all" | "subscriptions" | "income";
async function request(path: string, method: string, data?: unknown) {
  const response = await fetch(`/api/recurring${path}`, { method, headers: { "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Couldn't save the schedule."); return result;
}
function RecurringEditor({ record, options, kind, close }: { record?: RecurringView; options: LedgerOptions; kind: Kind; close: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [type, setType] = useState(record?.type || (kind === "income" ? "INCOME" : "EXPENSE"));
  const [frequency, setFrequency] = useState<ScheduleFrequency>(record?.frequency || "MONTHLY");
  const transfer = type === "TRANSFER" || type === "SAVINGS_TRANSFER";
  const accounts = options.accounts.filter(a => !a.archived || a.id === record?.accountId || a.id === record?.destinationAccountId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = recurringInput.safeParse({ ...form, type, frequency, amount: form.amount, accountId: form.accountId, destinationAccountId: transfer ? form.destinationAccountId || null : null, categoryId: transfer ? null : form.categoryId || null, goalId: type === "SAVINGS_TRANSFER" ? form.goalId || null : null, grossIncome: type === "INCOME" ? form.grossIncome || null : null, deductions: type === "INCOME" ? form.deductions || null : null, firstDay: form.firstDay || record?.firstDay || 15, secondDay: form.secondDay || record?.secondDay || 31, active: form.active === "on", autoCreate: form.autoCreate === "auto", subscription: type === "EXPENSE" && form.subscription === "on" });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { await request(record ? `/${record.id}` : "", record ? "PUT" : "POST", { ...parsed.data, ...(record ? { expectedRevision: record.revision } : {}) }); router.refresh(); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); setBusy(false); }
  }
  return <Modal title={record ? "Edit recurring item" : "Add a recurring item"} subtitle="Set the rhythm. Keep the history." close={close} busy={busy}><form className="dialog-body" onSubmit={submit}>
    <label>Name<input name="name" required maxLength={100} defaultValue={record?.name} autoFocus placeholder={kind === "income" ? "Net paycheck" : "Rent, internet, or a subscription"}/></label>
    <div className="field-grid"><label>Type<select value={type} onChange={e => setType(e.target.value as RecurringView["type"])}>{transactionTypes.map(t => <option key={t} value={t}>{typeLabel[t]}</option>)}</select></label><label>{type === "INCOME" ? "Net amount received (USD)" : "Amount (USD)"}<input name="amount" inputMode="decimal" defaultValue={record?.amount} required placeholder="0.00"/></label></div>
    {type === "INCOME" && <div className="field-grid"><label>Gross per paycheck · optional<input name="grossIncome" inputMode="decimal" defaultValue={record?.grossIncome || ""}/></label><label>Payroll deductions · optional<input name="deductions" inputMode="decimal" defaultValue={record?.deductions || ""}/></label></div>}
    <div className="field-grid"><label>Frequency<select value={frequency} onChange={e => setFrequency(e.target.value as ScheduleFrequency)}>{frequencies.map(f => <option value={f} key={f}>{frequencyLabel[f]}</option>)}</select></label><label>Next due date<input name="nextDueDate" type="date" defaultValue={record?.nextDueDate || options.today} min="1900-01-01" max="9999-12-31" required/></label></div>
    {frequency === "SEMIMONTHLY" && <div className="field-grid"><label>First monthly day<input name="firstDay" type="number" min={1} max={28} defaultValue={record?.firstDay || 15} required/></label><label>Second day · 31 means month end<input name="secondDay" type="number" min={2} max={31} defaultValue={record?.secondDay || 31} required/></label></div>}
    <p className="field-hint">Monthly and yearly dates retain their original day, using the last day in shorter months. Editing a schedule changes future occurrences only.</p>
    <label>{transfer ? "From account" : "Account"}<select name="accountId" defaultValue={record?.accountId || ""} required><option value="">Choose an account</option>{accounts.map(a => <option value={a.id} key={a.id}>{a.name}{a.archived ? " (archived)" : ""}</option>)}</select></label>
    {transfer ? <label>To account<select name="destinationAccountId" defaultValue={record?.destinationAccountId || ""} required><option value="">Choose destination</option>{accounts.filter(a => type !== "SAVINGS_TRANSFER" || ["SAVINGS", "HYSA"].includes(a.type)).map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label> : <label>Category<select name="categoryId" defaultValue={record?.categoryId || ""}><option value="">Uncategorized</option>{options.categories.filter(c => !c.archived || c.id === record?.categoryId).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
    {type === "SAVINGS_TRANSFER" && <label>Goal · optional<select name="goalId" defaultValue={record?.goalId || ""}><option value="">No goal assignment</option>{options.goals.filter(g => g.status === "ACTIVE" || g.id === record?.goalId).map(g => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>}
    <label>When due<select name="autoCreate" defaultValue={record?.autoCreate ? "auto" : "remind"}><option value="remind">Remind only — I will confirm the entry</option><option value="auto">Automatically create a transaction</option></select></label>
    <p className="field-hint">Auto-create records due dates while the app server is running and catches up after downtime. It does not pay a bill or move real money. Reminders appear here; no email or push notification is sent.</p>
    <label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={record?.active ?? true}/>Active schedule</label>
    {type === "EXPENSE" && <label className="checkbox-label"><input name="subscription" type="checkbox" defaultChecked={record?.subscription ?? kind === "subscriptions"}/>Include in subscriptions</label>}
    {!accounts.length && <Link className="text-link" href="/accounts" onClick={close}>Add an account first<ArrowRight size={15}/></Link>}
    <ErrorMessage message={error}/><div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancel</button><SaveButton busy={busy}>Save schedule</SaveButton></div>
  </form></Modal>;
}
export function RecurringManager({ view, options, kind = "all", compact = false }: { view: View; options: LedgerOptions; kind?: Kind; compact?: boolean }) {
  const router = useRouter(), [editor, setEditor] = useState<RecurringView | null | undefined>(), [confirm, setConfirm] = useState<{ record: RecurringView; action: "skip" | "delete" }>(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const rows = view.records.filter(r => kind === "all" || (kind === "subscriptions" ? r.subscription : r.type === "INCOME"));
  async function act(record: RecurringView, action: "post" | "skip" | "delete") {
    setBusy(true); setError(""); setMessage("");
    try { await request(`/${record.id}`, action === "delete" ? "DELETE" : "POST", action === "delete" ? undefined : { action, dueDate: record.nextDueDate }); setConfirm(undefined); setMessage(action === "post" ? "Due entry recorded. Balances updated." : action === "skip" ? "Occurrence skipped. No transaction created." : "Unused schedule deleted."); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't complete the action."); }
    finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); setError(""); setMessage("");
    try { const r = await request("", "PATCH"); setMessage(`${r.posted} entries created. ${r.blocked} schedules need attention.${r.batchLimitReached ? " More catch-up entries remain; run again or allow the worker to continue." : ""}`); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't run schedules."); }
    finally { setBusy(false); }
  }
  return <>
    <div className={compact ? "list-toolbar" : "page-heading"}><div>{!compact && <span className="eyebrow">MAKE THE REGULAR THINGS SIMPLE</span>}{compact ? <h2 className="budget-section-title">Recurring income</h2> : <h1>{kind === "subscriptions" ? "Subscriptions" : "Recurring items"}</h1>}{!compact && <p className="muted">Your schedule, with every occurrence accounted for.</p>}</div><div className="budget-actions"><button className="button secondary" disabled={busy} onClick={run}><RefreshCw size={16}/>Run due auto entries</button><button className="button primary" onClick={() => setEditor(null)}><Plus size={17}/>{kind === "income" ? "Schedule income" : "New recurring item"}</button></div></div>
    {!compact && <nav className="recurring-tabs" aria-label="Recurring views"><Link href="/recurring">All recurring items</Link><Link href="/subscriptions">Subscriptions</Link><Link href="/income">Income</Link></nav>}
    {kind === "subscriptions" && <><div className="account-totals"><div><span>Monthly equivalent</span><strong>{formatMoney(BigInt(view.subscriptionMonthlyMinor))}</strong></div><div><span>Annual equivalent</span><strong>{formatMoney(BigInt(view.subscriptionAnnualMinor))}</strong></div><p>Active subscriptions only. Estimates use 365 daily, 52 weekly, 26 biweekly, 24 twice-monthly, or 12 monthly charges per year. Actual billing dates may differ.</p></div><div className="list-toolbar"><span className="muted">{rows.filter(r => r.active).length} active subscriptions</span></div></>}
    {message && <p className="notice success" role="status">{message}</p>}{!confirm && <ErrorMessage message={error}/>}
    {rows.length ? <div className="recurring-grid">{rows.map(record => <article className={`panel recurring-card ${!record.active ? "archived" : ""}`} key={record.id}>
      <div className="goal-card-heading"><span className="feature-icon"><Repeat2 size={22}/></span><span className="goal-status">{record.active ? record.autoCreate ? "Auto-create" : "Remind only" : "Inactive"}</span></div>
      <h2>{record.name}</h2><p className="recurring-amount">{formatMoney(parseMoney(record.amount))}<span>{frequencyLabel[record.frequency]}</span></p>
      <p className="muted">{typeLabel[record.type]} · {record.accountName}{record.destinationName ? ` → ${record.destinationName}` : ""}{record.categoryName ? ` · ${record.categoryName}` : ""}</p>
      <p className="recurring-due"><CalendarDays size={16}/>{record.active && record.nextDueDate <= view.today ? "Due" : "Next"}: {record.nextDueDate}</p>
      {record.lastError && <p className="notice error">{record.lastError}</p>}
      <div className="record-actions"><button onClick={() => setEditor(record)} disabled={busy} aria-label={`Edit ${record.name}`}>Edit</button>{record.active && record.nextDueDate <= view.today && <button disabled={busy} onClick={() => act(record, "post")} aria-label={`Record due ${record.name}`}>Record due entry</button>}{record.active && <button disabled={busy} onClick={() => { setError(""); setConfirm({ record, action: "skip" }); }} aria-label={`Skip next ${record.name}`}>Skip next</button>}<button disabled={busy} onClick={() => { setError(""); setConfirm({ record, action: "delete" }); }} aria-label={`Delete ${record.name}`}>Delete</button></div>
    </article>)}</div> : <section className="panel empty-state"><Repeat2 size={34}/><h2>No {kind === "subscriptions" ? "subscriptions" : kind === "income" ? "recurring income" : "recurring items"} yet</h2><p className="muted">Create a schedule for something that repeats. Choose reminders if you want to confirm each occurrence before it becomes a transaction.</p></section>}
    <p className="workspace-note">Automatic processing checks once per minute while enabled on a running server. Refresh this page to see updates. A skipped or deleted generated entry is never recreated for the same scheduled date.</p>
    {editor !== undefined && <RecurringEditor record={editor || undefined} options={options} kind={kind} close={() => setEditor(undefined)}/>}
    {confirm && <Modal title={confirm.action === "skip" ? "Skip this occurrence?" : "Delete this schedule?"} close={() => setConfirm(undefined)} busy={busy}><div className="dialog-body"><p><strong>{confirm.record.name}</strong>{confirm.action === "skip" ? ` will skip ${confirm.record.nextDueDate} and move to its next date. No transaction will be created for the skipped date.` : " can only be deleted if it has no history. Set it inactive to stop future entries while keeping past records."}</p><ErrorMessage message={error}/><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(undefined)}>Cancel</button><button className={`button ${confirm.action === "delete" ? "danger" : "primary"}`} disabled={busy} onClick={() => act(confirm.record, confirm.action)}>{busy ? "Working…" : confirm.action === "skip" ? "Skip date" : "Delete schedule"}</button></div></div></Modal>}
  </>;
}
