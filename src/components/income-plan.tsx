"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { incomeInput, salaryFrequencies, type IncomeView } from "@/lib/income";
import { frequencyLabel } from "@/lib/recurring";
import { decimalInput } from "@/lib/ledger-validation";
import { formatMoney } from "@/lib/finance";
import { ErrorMessage, SaveButton } from "./ledger-ui";
export function IncomePlan({ view }: { view: IncomeView }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaved(false);
    const parsed = incomeInput.safeParse({ ...Object.fromEntries(new FormData(event.currentTarget)), expectedRevision: view.settings?.revision ?? null });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { const response = await fetch("/api/income", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setSaved(true); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save your plan."); }
    finally { setBusy(false); }
  }
  return <section className="panel income-plan"><h2>Salary planning</h2><p className="muted">Gross salary is informational. Enter your expected take-home paycheck separately; it is never inferred from salary.</p><form onSubmit={submit}><div className="field-grid"><label>Annual gross salary (USD)<input name="annualSalary" inputMode="decimal" required defaultValue={decimalInput(view.settings?.annualSalaryMinor || "0")}/></label><label>Pay frequency<select name="payFrequency" defaultValue={view.settings?.payFrequency || "BIWEEKLY"}>{salaryFrequencies.map(f => <option key={f} value={f}>{frequencyLabel[f]}</option>)}</select></label></div><label>Expected net paycheck (USD)<input name="netPaycheck" inputMode="decimal" required defaultValue={decimalInput(view.settings?.netPaycheckMinor || "0")}/></label><ErrorMessage message={error}/>{saved && <p className="notice success" role="status">Income planning settings saved.</p>}<div className="form-actions"><SaveButton busy={busy}>Save income plan</SaveButton></div></form>{view.projection && <div className="income-estimates"><div><span>Estimated gross per paycheck</span><strong>{formatMoney(BigInt(view.projection.grossPerPaycheckMinor))}</strong></div><div><span>Average expected monthly net</span><strong>{formatMoney(BigInt(view.projection.monthlyNetMinor))}</strong></div></div>}<p className="field-hint">Annual equivalents use 52 weekly, 26 biweekly, 24 twice-monthly, or 12 monthly paychecks. Calendar-year counts may differ. This plan does not post income or change budgets automatically.</p></section>;
}
