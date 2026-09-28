import { pageUser } from "@/server/page-user";
import { ledgerOptions } from "@/server/ledger";
import { AccountManager } from "@/components/account-manager";
export default async function AccountsPage() { const user = await pageUser(), options = await ledgerOptions(user.id); return <main className="page"><AccountManager accounts={options.accounts}/></main>; }
