import { pageUser } from "@/server/page-user";
import { ledgerOptions } from "@/server/ledger";
import { CategoryManager } from "@/components/category-manager";
export default async function CategoriesPage() { const user = await pageUser(), options = await ledgerOptions(user.id); return <main className="page"><CategoryManager categories={options.categories}/></main>; }
