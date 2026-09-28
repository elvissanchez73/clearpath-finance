import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { budgetView } from "@/server/budgets";
import { formatMoney } from "@/lib/finance";

export async function BudgetSnapshot({ userId, month }: { userId: string; month: string }) {
  const view = await budgetView(userId, month);
  return <section className="panel dashboard-budget"><div><h2>{view.totals ? "Remaining to spend this month" : "Give this month a spending plan"}</h2>{view.totals && <strong>{formatMoney(BigInt(view.totals.remainingToSpendMinor))}</strong>}<p className="muted">{view.totals ? "Planned net income − recorded expenses − planned cash savings." : "Set income, savings, and category limits to see how much room remains."}</p></div><Link className="text-link" href={`/budget?month=${month}`}>{view.plan ? "View budget" : "Create a budget"}<ArrowRight size={16}/></Link></section>;
}
