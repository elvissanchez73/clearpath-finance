import { pageUser } from "@/server/page-user";
import { withOwner } from "@/server/db";
import { ledgerOptions } from "@/server/ledger";
import { incomeView } from "@/server/income";
import { budgetView } from "@/server/budgets";
import { goalsView } from "@/server/goals";
import { IncomePlan } from "@/components/income-plan";
import { AccountManager } from "@/components/account-manager";
import { CategoryManager } from "@/components/category-manager";
import { BudgetActions } from "@/components/budget-editor";
import { GoalManager } from "@/components/goal-manager";
import { SetupControls } from "@/components/setup-controls";
export default async function OnboardingPage() {
  const user = await pageUser(), options = await ledgerOptions(user.id), month = options.today.slice(0, 7);
  const settings = await withOwner(user.id, tx => tx.userSettings.findUniqueOrThrow({ where: { userId: user.id } }));
  const steps = ["Welcome", "Income", "Accounts", "Monthly budget", "First savings goal"], step = settings.onboardingStep;
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">A FEW STEPS TOWARD CLARITY</span><h1>{steps[step]}</h1><p className="muted">Step {step + 1} of 5 · Your progress is saved to your workspace.</p></div></div><ol className="setup-steps">{steps.map((name, i) => <li key={name} aria-current={step === i ? "step" : undefined}>{i + 1}. {name}</li>)}</ol>
    {step === 0 && <section className="panel setup-welcome"><h2>Welcome, {user.name.split(" ")[0]}.</h2><p>Start with your take-home income, add the accounts you use, plan this month, and choose a savings goal.</p><p className="muted">Your workspace starts empty and stays private. Nothing here connects to your bank or moves money. Skip any step and add details later.</p></section>}
    {step === 1 && <IncomePlan view={await incomeView(user.id, month)}/>}
    {step === 2 && <AccountManager accounts={options.accounts}/>}
    {step === 3 && <section className="panel setup-welcome"><h2>Plan {month}</h2><p className="muted">Add your spending categories, then open the budget editor. Saving categories refreshes this page so they appear in the editor.</p><CategoryManager categories={options.categories}/><BudgetActions view={await budgetView(user.id, month)}/></section>}
    {step === 4 && <GoalManager view={await goalsView(user.id)} options={options}/>}
    <SetupControls step={step} complete={settings.onboardingComplete}/>
  </main>;
}
