"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Target, Shield, Home, Car, Plane, GraduationCap, Heart, Gift, Plus, ArrowRight, Check } from "lucide-react";
import { goalInput, goalIcons, type GoalView, type GoalsView } from "@/lib/goals";
import { formatMoney } from "@/lib/finance";
import { decimalInput } from "@/lib/ledger-validation";
import type { LedgerOptions } from "@/lib/ledger-types";
import { Modal, SaveButton, ErrorMessage } from "./ledger-ui";
import { AddTransaction } from "./transaction-form";

export async function goalRequest(path: string, method: string, data?: unknown) {
  const response = await fetch(`/api/goals${path}`, { method, headers: { "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "This change could not be saved.");
  return result;
}
export function GoalIcon({ name }: { name: string }) { const icons = { target: Target, shield: Shield, home: Home, car: Car, plane: Plane, "graduation-cap": GraduationCap, heart: Heart, gift: Gift }; const Icon = icons[name as keyof typeof icons] || Target; return <Icon size={22} aria-hidden="true"/>; }
export const friendlyDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const money = (value: string) => formatMoney(BigInt(value));

function GoalEditor({ goal, view, close }: { goal?: GoalView; view: GoalsView; close: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = goalInput.safeParse({ ...form, target: form.target || null, targetDate: form.targetDate || null, accountId: form.accountId || null });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { await goalRequest(goal ? `/${goal.id}` : "", goal ? "PUT" : "POST", { ...parsed.data, ...(goal ? { expectedRevision: goal.revision } : {}) }); router.refresh(); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save this goal."); setBusy(false); }
  }
  return <Modal title={goal ? "Edit savings goal" : "Make room for a goal"} subtitle="A clear target. One step at a time." close={close} busy={busy}><form className="dialog-body" onSubmit={submit}>
    <label>Goal name<input name="name" defaultValue={goal?.name} placeholder="Emergency fund" required maxLength={80} autoFocus/></label>
    <div className="field-grid"><label>Target amount (USD)<input name="target" inputMode="decimal" defaultValue={goal?.targetMinor ? decimalInput(goal.targetMinor) : ""} placeholder="10,000.00"/></label><label>Already saved (USD)<input name="startingAmount" inputMode="decimal" defaultValue={decimalInput(goal?.startingAmountMinor || "0")} required/></label></div>
    <p className="field-hint">Already saved is an opening allocation for this goal, not an account deposit. Do not include savings transfers you will also link below.</p>
    <div className="field-grid"><label>Planned monthly amount (USD)<input name="monthlyContribution" inputMode="decimal" defaultValue={decimalInput(goal?.monthlyContributionMinor || "0")} required/></label><label>Target date · optional<input type="date" name="targetDate" min="1900-01-01" max="9999-12-31" defaultValue={goal?.targetDate || ""}/></label></div>
    <div className="field-grid"><label>Status<select name="status" defaultValue={goal?.status || "ACTIVE"}><option value="ACTIVE">Active</option><option value="PAUSED">Paused / future</option><option value="COMPLETED">Completed</option></select></label><label>Savings account · optional<select name="accountId" defaultValue={goal?.accountId || ""}><option value="">No specific account</option>{view.accounts.filter(a => !a.archived || a.id === goal?.accountId).map(a => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (archived)" : ""}</option>)}</select></label></div>
    <p className="field-hint">A paused goal can have no target. Active goals complete automatically when funded and reopen if their progress drops below the target. An associated account limits contributions to transfers into that account; its entire balance is never counted as goal progress.</p>
    <fieldset className="icon-picker"><legend>Goal icon</legend><div>{goalIcons.map(icon => <label key={icon}><input type="radio" name="icon" value={icon} defaultChecked={(goal?.icon || "target") === icon} aria-label={icon}/><span><GoalIcon name={icon}/></span></label>)}</div></fieldset>
    <label>Notes · optional<textarea name="notes" defaultValue={goal?.notes || ""} maxLength={500} rows={2}/></label>
    <ErrorMessage message={error}/><div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button><SaveButton busy={busy}>Save goal</SaveButton></div>
  </form></Modal>;
}
export function GoalManager({ view, options }: { view: GoalsView; options: LedgerOptions }) {
  const router = useRouter(), [editor, setEditor] = useState<GoalView | null | undefined>(), [deleting, setDeleting] = useState<GoalView>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove() {
    if (!deleting) return; setBusy(true); setError("");
    try { await goalRequest(`/${deleting.id}`, "DELETE"); setDeleting(undefined); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't delete the goal."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">YOUR NEXT CHAPTER</span><h1>Savings goals</h1><p className="muted">See your progress. Make your next move.</p></div><div className="budget-actions"><Link className="button secondary" href="/goals/roadmap">Savings roadmap<ArrowRight size={17}/></Link><button className="button primary" onClick={() => setEditor(null)}><Plus size={17}/>New goal</button></div></div>
    <div className="goal-explainer"><Target size={22}/><p>Progress = already-saved allocation + linked savings transfers. Add a contribution here or assign an existing savings transfer in Transactions. Account balances update from the transfer itself.</p></div>
    {view.goals.length ? <div className="goal-grid">{view.goals.map(goal => {
      const current = BigInt(goal.currentMinor), target = goal.targetMinor === null ? null : BigInt(goal.targetMinor), percent = target ? current * 100n / target : null;
      const progress = percent === null ? 0 : Number(percent > 100n ? 100n : percent);
      return <article className={`panel goal-card ${goal.status.toLowerCase()}`} key={goal.id}>
        <div className="goal-card-heading"><span className="feature-icon"><GoalIcon name={goal.icon}/></span><span className="goal-status">{goal.status === "COMPLETED" && <Check size={14}/>} {goal.status === "PAUSED" ? "Paused" : goal.status === "COMPLETED" ? "Completed" : `Priority ${goal.priority}`}</span></div>
        <h2>{goal.name}</h2>{goal.accountName && <p className="muted goal-account">{goal.accountName}</p>}
        <div className="goal-balance"><strong>{money(goal.currentMinor)}</strong><span>{target ? `of ${money(goal.targetMinor!)}` : "Target not set"}</span></div>
        <div className="budget-meter" role="meter" aria-label={`${goal.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={percent === null ? "No target" : `${percent}% funded`}><span style={{ width: `${progress}%` }}/></div>
        <div className="budget-status"><span>{percent === null ? "Set a target when ready" : `${percent}% funded`}</span><strong>{goal.projection.remainingMinor === null ? "" : `${money(goal.projection.remainingMinor)} to go`}</strong></div>
        <dl className="goal-facts"><div><dt>Planned monthly</dt><dd>{money(goal.monthlyContributionMinor)}</dd></div><div><dt>Contributed this month</dt><dd>{money(goal.monthContributionMinor)}</dd></div><div><dt>Estimated completion</dt><dd>{goal.status === "PAUSED" ? "Paused" : goal.projection.months === "0" ? "Target reached" : goal.projection.estimatedDate ? `Around ${friendlyDate(goal.projection.estimatedDate)}` : BigInt(goal.monthlyContributionMinor) === 0n ? "Set a monthly amount" : "Beyond date range"}</dd></div></dl>
        {goal.targetDate && <div className="goal-target"><strong>Target: {friendlyDate(goal.targetDate)}</strong><p>{goal.projection.remainingMinor === "0" ? "Your target is funded." : goal.projection.requiredMonthlyMinor !== null ? `${money(goal.projection.requiredMonthlyMinor)}/month needed. ${goal.projection.sufficient ? "Your planned amount covers this pace." : "A little more time or a higher monthly amount would help."}` : "No full monthly contribution dates remain. Review the target date or add savings already available."}{goal.status === "PAUSED" ? " Projection assumes you resume saving." : ""}</p></div>}
        {goal.notes && <p className="muted goal-notes">{goal.notes}</p>}
        <div className="goal-card-actions">{goal.status === "ACTIVE" && <AddTransaction options={options} goalId={goal.id}/>}<Link className="text-link" href={`/transactions?type=SAVINGS_TRANSFER&goal=${goal.id}`}>{goal.contributionCount} contributions<ArrowRight size={15}/></Link></div>
        <div className="record-actions"><button onClick={() => setEditor(goal)} aria-label={`Edit ${goal.name}`}>Edit</button><button onClick={() => { setError(""); setDeleting(goal); }} aria-label={`Delete ${goal.name}`}>Delete</button></div>
      </article>;
    })}</div> : <section className="panel empty-state"><Target size={36}/><h2>What are you saving for?</h2><p className="muted">An emergency fund, a home, or something entirely your own. Start with one goal and a monthly amount that works for you.</p><button className="button primary" onClick={() => setEditor(null)}>Create your first goal<Plus size={17}/></button></section>}
    <p className="workspace-note">Estimates assume fixed monthly contributions beginning one month from today, no interest or investment growth, and no withdrawals. They are plans, not guaranteed dates.</p>
    {editor !== undefined && <GoalEditor goal={editor || undefined} view={view} close={() => setEditor(undefined)}/>}
    {deleting && <Modal title="Delete this goal?" close={() => setDeleting(undefined)} busy={busy}><div className="dialog-body"><p><strong>{deleting.name}</strong> and its opening allocation will be removed. This does not change account balances.</p><p className="muted">Goals with linked contributions cannot be deleted. Pause the goal or remove its assignments in Transactions first.</p><ErrorMessage message={error}/><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(undefined)}>Keep goal</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete goal"}</button></div></div></Modal>}
  </>;
}
