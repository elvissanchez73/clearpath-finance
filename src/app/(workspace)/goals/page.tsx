import { pageUser } from "@/server/page-user";
import { goalsView } from "@/server/goals";
import { ledgerOptions } from "@/server/ledger";
import { GoalManager } from "@/components/goal-manager";
export default async function GoalsPage() { const user = await pageUser(); const view = await goalsView(user.id), options = await ledgerOptions(user.id); return <main className="page"><GoalManager view={view} options={options}/></main>; }
