/** Money is bigint minor units end-to-end. Number is only used for non-monetary chart ratios. */
export function parseMoney(input: string): bigint {
  if (!/^-?\d{1,15}(\.\d{1,2})?$/.test(input)) throw new Error("Use a decimal amount with at most two fractional digits.");
  const negative = input.startsWith("-");
  const [whole, fraction = ""] = input.replace(/^-/, "").split(".");
  return (negative ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
export function formatMoney(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "−" : ""}$${(absolute / 100n).toLocaleString("en-US")}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
export type FinancialTransaction = { type: "INCOME" | "EXPENSE" | "TRANSFER" | "SAVINGS_TRANSFER"; amountMinor: bigint; accountId: string; destinationAccountId?: string | null; date: Date };
export const sourceDelta = (type: FinancialTransaction["type"], amount: bigint) => type === "INCOME" ? amount : -amount;
export function cashFlowTotals(income: bigint, expenses: bigint, savings: bigint) {
  return { income, expenses, savings, remaining: income - expenses - savings, savingsRateBasisPoints: income > 0n ? savings * 10000n / income : null };
}
export function accountBalance(starting: bigint, accountId: string, transactions: FinancialTransaction[]) {
  return transactions.reduce((total, t) => {
    if (t.accountId === accountId) total += sourceDelta(t.type, t.amountMinor);
    if (t.destinationAccountId === accountId) total += t.amountMinor;
    return total;
  }, starting);
}
export function monthlyTotals(transactions: FinancialTransaction[], year: number, month: number) {
  if (month < 1 || month > 12) throw new Error("Invalid month");
  const rows = transactions.filter(t => t.date.getUTCFullYear() === year && t.date.getUTCMonth() === month - 1);
  const sum = (type: FinancialTransaction["type"]) => rows.filter(t => t.type === type).reduce((a, t) => a + t.amountMinor, 0n);
  const income = sum("INCOME"), expenses = sum("EXPENSE"), savings = sum("SAVINGS_TRANSFER");
  return cashFlowTotals(income, expenses, savings);
}
export const remainingBudget = (plannedIncome: bigint, actualExpenses: bigint, plannedSavings: bigint) => plannedIncome - actualExpenses - plannedSavings;
export function goalProgress(starting: bigint, contributions: bigint[], target: bigint) {
  if (target <= 0n) throw new Error("Target must be positive");
  const current = contributions.reduce((a, b) => a + b, starting);
  return { current, remaining: current < target ? target - current : 0n, basisPoints: current * 10000n / target };
}
export function completionMonths(remaining: bigint, monthly: bigint): bigint | null {
  if (remaining <= 0n) return 0n;
  return monthly > 0n ? (remaining + monthly - 1n) / monthly : null;
}
export function requiredMonthly(remaining: bigint, months: number): bigint | null {
  if (remaining <= 0n) return 0n;
  if (!Number.isInteger(months) || months <= 0) return null;
  return (remaining + BigInt(months) - 1n) / BigInt(months);
}
