import Link from "next/link";
import { pageUser } from "@/server/page-user";
import { ledgerOptions, searchTransactions } from "@/server/ledger";
import { ApiError } from "@/server/errors";
import { transactionFilters } from "@/lib/ledger-validation";
import { AddTransaction } from "@/components/transaction-form";
import { TransactionList } from "@/components/transaction-list";
import { TransactionFilters } from "@/components/transaction-filters";
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await pageUser(), options = await ledgerOptions(user.id), raw = await searchParams;
  const values = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const parsed = transactionFilters.safeParse(values);
  let result: Awaited<ReturnType<typeof searchTransactions>> = { records: [], total: 0, page: 1, pages: 1 };
  let error = parsed.success ? "" : parsed.error.issues[0].message;
  if (parsed.success) { try { result = await searchTransactions(user.id, parsed.data); } catch (e) { if (e instanceof ApiError) error = e.message; else throw e; } }
  const pageLink = (page: number) => { const params = new URLSearchParams(values); params.set("page", page.toString()); return `/transactions?${params}`; };
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">THE EVERYDAY DETAILS</span><h1>Transactions</h1><p className="muted">Every entry adds a little clarity.</p></div><AddTransaction options={options}/></div><TransactionFilters options={options} values={values}/>{error ? <p className="notice error" role="alert">{error} <Link href="/transactions">Reset filters</Link></p> : <section className="panel activity-panel"><div className="activity-heading"><h2>Your activity</h2><span className="muted">{result.total} {result.total === 1 ? "transaction" : "transactions"}</span></div><TransactionList records={result.records} options={options}/><nav className="pagination" aria-label="Transaction pages">{result.page > 1 ? <Link className="button secondary" href={pageLink(result.page - 1)}>Previous</Link> : <span/>}<span>Page {result.page} of {result.pages}</span>{result.page < result.pages ? <Link className="button secondary" href={pageLink(result.page + 1)}>Next</Link> : <span/>}</nav></section>}</main>;
}
