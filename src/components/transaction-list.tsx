"use client";
import { useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, ReceiptText } from "lucide-react";
import { formatMoney } from "@/lib/finance";
import { typeLabel, type LedgerOptions, type TransactionView } from "@/lib/ledger-types";
import { CategoryIcon, RecordActions } from "./ledger-ui";
import { TransactionForm } from "./transaction-form";
export function TransactionList({ records, options, editable = true }: { records: TransactionView[]; options: LedgerOptions; editable?: boolean }) {
  const [edit, setEdit] = useState<TransactionView>();
  if (!records.length) return <div className="empty-state transaction-empty"><ReceiptText size={32}/><h2>No transactions here yet</h2><p className="muted">Add your first entry, or adjust your filters to see more activity.</p></div>;
  return <><ul className="transaction-list">{records.map(row => {
    const transfer = row.type === "TRANSFER" || row.type === "SAVINGS_TRANSFER";
    return <li key={row.id} className="transaction-row"><span className={`transaction-icon ${row.type.toLowerCase()}`}>{transfer ? <ArrowRightLeft size={20}/> : row.category ? <CategoryIcon name={row.category.icon}/> : row.type === "INCOME" ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}</span><div className="transaction-detail"><strong>{row.description}</strong><div className="transaction-meta"><span>{new Date(row.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span><span>{transfer ? typeLabel[row.type] : row.category?.name || "Uncategorized"}</span></div><p className="transaction-account">{row.account.name}{row.destinationAccount ? ` → ${row.destinationAccount.name}` : ""}</p>{row.grossIncomeMinor !== null && <p className="transaction-account">Gross {formatMoney(BigInt(row.grossIncomeMinor))} · deductions {formatMoney(BigInt(row.deductionsMinor || "0"))}</p>}{row.goalName && <p className="transaction-account">Goal: {row.goalName}</p>}{row.note && <p className="transaction-note">{row.note}</p>}</div><div className="transaction-value"><strong className={row.type === "INCOME" ? "income-value" : ""}>{row.type === "INCOME" ? "+" : ""}{formatMoney(BigInt(row.amountMinor) * (row.type === "EXPENSE" ? -1n : 1n))}</strong><span>{transfer ? "Between accounts" : typeLabel[row.type]}</span>{editable && <RecordActions resource="transactions" id={row.id} name={row.description} edit={() => setEdit(row)}/>}</div></li>;
  })}</ul>{edit && <TransactionForm options={options} transaction={edit} close={() => setEdit(undefined)}/>}</>;
}
