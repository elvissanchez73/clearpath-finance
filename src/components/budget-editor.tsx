"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Pencil } from "lucide-react";
import { budgetInput, copyBudgetInput, neighboringMonth, monthLabel, type BudgetView } from "@/lib/budget";
import { decimalInput } from "@/lib/ledger-validation";
import { parseMoney, formatMoney } from "@/lib/finance";
import { Modal, ErrorMessage, SaveButton, CategoryIcon } from "./ledger-ui";

async function send(month: string, data: unknown, copy = false) {
  const response = await fetch(`/api/budgets/${month}${copy ? "/copy" : ""}`, { method: copy ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The budget could not be saved.");
  return result;
}
function BudgetEditor({ view, close }: { view: BudgetView; close: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [income, setIncome] = useState(decimalInput(view.plan?.incomeMinor ?? view.defaults?.incomeMinor ?? "0"));
  const [savings, setSavings] = useState(decimalInput(view.plan?.savingsMinor ?? view.defaults?.savingsMinor ?? "0"));
  const [amounts, setAmounts] = useState<Record<string, string>>(Object.fromEntries(view.plan?.items.map(i => [i.categoryId, decimalInput(i.amountMinor)]) || []));
  const categories = view.categories.filter(c => !c.archived || view.plan?.items.some(i => i.categoryId === c.id));
  const safeMoney = (value: string) => /^\d{1,12}(\.\d{1,2})?$/.test(value) ? parseMoney(value) : 0n;
  const unallocated = safeMoney(income) - safeMoney(savings) - Object.values(amounts).reduce((sum, value) => sum + safeMoney(value), 0n);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const parsed = budgetInput.safeParse({ expectedRevision: view.plan?.revision ?? null, income, savings, items: categories.filter(c => amounts[c.id]?.trim()).map(c => ({ categoryId: c.id, amount: amounts[c.id].trim(), recurring: form.has(`recurring-${c.id}`) })) });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { await send(view.month, parsed.data); router.refresh(); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save this budget."); setBusy(false); }
  }
  return <Modal title={view.plan ? "Edit monthly budget" : "Plan your month"} subtitle={monthLabel(view.month)} close={close} busy={busy}>
    <form className="dialog-body budget-editor" onSubmit={submit}>
      <div className="field-grid"><label>Planned net income (USD)<input value={income} onChange={e => setIncome(e.target.value)} inputMode="decimal" required autoFocus/></label><label>Planned cash savings (USD)<input value={savings} onChange={e => setSavings(e.target.value)} inputMode="decimal" required/></label></div>
      <p className="field-hint">Plan the take-home income you expect to receive. Savings is separate from spending allocations.</p>
      <div className="budget-editor-heading"><h3>Spending by category</h3><Link className="text-link" href="/categories" onClick={close}>Manage categories</Link></div>
      <p className="field-hint">Leave an amount blank to remove its allocation; zero is an explicit $0 limit. Mark Repeat to seed that allocation into next month when no next-month budget exists yet.</p>
      {categories.length ? <div className="budget-input-list">{categories.map(category => <div className="budget-input-row" key={category.id}>
        <label><span><CategoryIcon name={category.icon} size={16}/>{category.name}{category.archived ? " (archived)" : ""}</span><input aria-label={`${category.name} budget (USD)`} inputMode="decimal" placeholder="No allocation" value={amounts[category.id] || ""} onChange={e => setAmounts({ ...amounts, [category.id]: e.target.value })}/></label>
        <label className="checkbox-label"><input name={`recurring-${category.id}`} type="checkbox" defaultChecked={view.plan?.items.find(i => i.categoryId === category.id)?.recurring ?? false} aria-label={`Repeat ${category.name}`}/>Repeat</label>
      </div>)}</div> : <p className="muted">You can save income and savings now, then add categories to allocate your spending.</p>}
      <div className={`allocation-preview ${unallocated < 0n ? "budget-warning" : ""}`}><span>{unallocated < 0n ? "Plan exceeds income by" : "Left to allocate"}</span><strong>{formatMoney(unallocated < 0n ? -unallocated : unallocated)}</strong></div>
      <ErrorMessage message={error}/><div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancel</button><SaveButton busy={busy}>Save budget</SaveButton></div>
    </form>
  </Modal>;
}
function CopyBudget({ month, close }: { month: string; close: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget), parsed = copyBudgetInput.safeParse({ sourceMonth: form.get("sourceMonth"), recurringOnly: form.get("mode") === "recurring" });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { await send(month, parsed.data, true); router.refresh(); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't copy the budget."); setBusy(false); }
  }
  return <Modal title="Copy a previous budget" subtitle={`Into ${monthLabel(month)}`} close={close} busy={busy}>
    <form className="dialog-body" onSubmit={submit}>
      <label>Copy from<input name="sourceMonth" type="month" defaultValue={neighboringMonth(month, -1) || ""} min="1900-01" max={neighboringMonth(month, -1) || "1900-01"} required/></label>
      <label>Category allocations<select name="mode"><option value="all">All active categories</option><option value="recurring">Only items marked Repeat</option></select></label>
      <p className="muted">Copies planned income, planned savings, and the selected allocations. Archived categories are skipped. Transactions and the original month stay unchanged.</p>
      <ErrorMessage message={error}/><div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancel</button><SaveButton busy={busy}>Copy budget</SaveButton></div>
    </form>
  </Modal>;
}
export function BudgetActions({ view }: { view: BudgetView }) {
  const [dialog, setDialog] = useState<"edit" | "copy" | null>(null);
  return <><div className="budget-actions">{!view.plan && neighboringMonth(view.month, -1) && <button className="button secondary" onClick={() => setDialog("copy")}><Copy size={17}/>Copy previous month</button>}<button className="button primary" onClick={() => setDialog("edit")}>{view.plan ? <Pencil size={17}/> : <Plus size={17}/>} {view.plan ? "Edit budget" : "Create budget"}</button></div>{dialog === "edit" && <BudgetEditor view={view} close={() => setDialog(null)}/>} {dialog === "copy" && <CopyBudget month={view.month} close={() => setDialog(null)}/>}</>;
}
