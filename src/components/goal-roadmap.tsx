"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, ArrowLeft, Route, Check } from "lucide-react";
import { roadmap, roadmapInput, type GoalsView } from "@/lib/goals";
import { decimalInput } from "@/lib/ledger-validation";
import { parseMoney, formatMoney } from "@/lib/finance";
import { SaveButton, ErrorMessage } from "./ledger-ui";
import { GoalIcon, friendlyDate, goalRequest } from "./goal-manager";

export function GoalRoadmap({ view }: { view: GoalsView }) {
  const router = useRouter(), [amount, setAmount] = useState(decimalInput(view.roadmapMonthlyMinor)), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const valid = roadmapInput.safeParse({ monthlyContribution: amount });
  const milestones = roadmap(view.goals, valid.success ? parseMoney(valid.data.monthlyContribution) : 0n, view.today);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setSaved(false);
    if (!valid.success) { setError(valid.error.issues[0].message); return; }
    setBusy(true);
    try { await goalRequest("/roadmap", "PUT", valid.data); setSaved(true); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save your plan."); }
    finally { setBusy(false); }
  }
  async function move(index: number, delta: number) {
    const ids = view.goals.map(g => g.id), destination = index + delta;
    if (destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    setBusy(true); setError("");
    try { await goalRequest("/order", "PUT", { ids }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't reorder goals."); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><span className="eyebrow">ONE GOAL, THEN THE NEXT</span><h1>Savings roadmap</h1><p className="muted">Choose your pace and put your priorities in order.</p></div><Link className="button secondary" href="/goals"><ArrowLeft size={17}/>All goals</Link></div>
    <section className="panel roadmap-plan"><form onSubmit={save}><label>Shared monthly savings (USD)<input inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setSaved(false); }} required/></label><SaveButton busy={busy}>Save assumption</SaveButton></form><p className="muted">This one amount goes to the first active goal, then moves to the next. Any unused amount in the final month continues to the next goal. Paused and completed goals do not use this monthly amount. This scenario is separate from each goal’s individual monthly estimate.</p>{saved && <p className="notice success" role="status"><Check size={16}/>Monthly assumption saved.</p>}<ErrorMessage message={error}/></section>
    {!view.goals.length ? <section className="panel empty-state"><Route size={35}/><h2>Your roadmap starts with a goal</h2><Link className="button primary" href="/goals">Create a goal</Link></section> : <ol className="roadmap-list">{view.goals.map((goal, index) => {
      const milestone = milestones[index];
      return <li key={goal.id} className={goal.status === "ACTIVE" ? "" : "roadmap-inactive"}><span className="roadmap-number">{index + 1}</span><article className="panel roadmap-card"><span className="feature-icon"><GoalIcon name={goal.icon}/></span><div className="roadmap-content"><h2>{goal.name}</h2><p className="muted">{formatMoney(BigInt(goal.currentMinor))}{goal.targetMinor ? ` of ${formatMoney(BigInt(goal.targetMinor))}` : " · Target not set"}</p><strong>{goal.status === "PAUSED" ? "Paused · excluded from this timeline" : goal.status === "COMPLETED" ? "Completed · target funded" : !valid.success ? "Enter a valid monthly amount" : milestone.estimatedDate ? `Around ${friendlyDate(milestone.estimatedDate)} · ${milestone.months} months from now` : amount && parseMoney(valid.data.monthlyContribution) > 0n ? "Estimate beyond the supported date range" : "Set a monthly amount to estimate"}</strong></div><div className="roadmap-order"><button className="quiet-button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${goal.name} earlier`}><ArrowUp size={18}/></button><button className="quiet-button" disabled={busy || index === view.goals.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${goal.name} later`}><ArrowDown size={18}/></button></div></article></li>;
    })}</ol>}
    <p className="workspace-note">Monthly contributions start one month from {friendlyDate(view.today)}. No interest, market growth, or withdrawals are assumed. Reordering and this saved assumption never move money or create transactions.</p>
  </>;
}
