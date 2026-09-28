import { pageUser } from "@/server/page-user";
import { recurringView } from "@/server/recurring";
import { ledgerOptions } from "@/server/ledger";
import { RecurringManager } from "@/components/recurring-manager";
export default async function SubscriptionsPage() { const user = await pageUser(); return <main className="page"><RecurringManager kind="subscriptions" view={await recurringView(user.id)} options={await ledgerOptions(user.id)}/></main>; }
