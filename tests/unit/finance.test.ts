import { describe, expect, it } from "vitest";
import { parseMoney, formatMoney, accountBalance, monthlyTotals, remainingBudget, goalProgress, completionMonths, requiredMonthly, type FinancialTransaction } from "@/lib/finance";
const rows: FinancialTransaction[] = [
  { type: "INCOME", amountMinor: 375000n, accountId: "checking", date: new Date("2026-09-05") },
  { type: "EXPENSE", amountMinor: 162000n, accountId: "checking", date: new Date("2026-09-06") },
  { type: "SAVINGS_TRANSFER", amountMinor: 150000n, accountId: "checking", destinationAccountId: "hysa", date: new Date("2026-09-07") },
  { type: "TRANSFER", amountMinor: 5000n, accountId: "checking", destinationAccountId: "cash", date: new Date("2026-09-08") },
  { type: "EXPENSE", amountMinor: 1200n, accountId: "checking", date: new Date("2026-08-31") },
];
describe("decimal-safe finances", () => {
  it("adds cents exactly", () => expect(parseMoney("0.10") + parseMoney("0.20")).toBe(30n));
  it("parses signed and single-decimal values", () => { expect(parseMoney("-2.5")).toBe(-250n); expect(parseMoney("0")).toBe(0n); });
  it.each(["1.001", "1e5", "NaN", "1,500", "Infinity"])("rejects ambiguous amount %s", input => expect(() => parseMoney(input)).toThrow());
  it("formats large amounts without Number conversion", () => expect(formatMoney(900719925474099301n)).toBe("$9,007,199,254,740,993.01"));
  it("calculates account inflows and outflows", () => { expect(accountBalance(10000n, "checking", rows)).toBe(66800n); expect(accountBalance(0n, "hysa", rows)).toBe(150000n); });
  it("internal transfers conserve total balances", () => { const transfers = rows.filter(r => r.destinationAccountId); expect(["checking", "hysa", "cash"].reduce((sum, account) => sum + accountBalance(0n, account, transfers), 0n)).toBe(0n); });
  it("separates spending, savings, and transfers by calendar month", () => expect(monthlyTotals(rows, 2026, 9)).toEqual({ income: 375000n, expenses: 162000n, savings: 150000n, remaining: 63000n, savingsRateBasisPoints: 4000n }));
  it("does not divide by zero income", () => expect(monthlyTotals([], 2026, 9).savingsRateBasisPoints).toBeNull());
  it("calculates remaining budget from planned income and savings", () => expect(remainingBudget(375000n, 188600n, 150000n)).toBe(36400n));
  it("retains negative remaining budgets", () => expect(remainingBudget(100n, 200n, 50n)).toBe(-150n));
  it("calculates verified goal progress", () => expect(goalProgress(300000n, [75000n, 75000n], 1000000n)).toEqual({ current: 450000n, remaining: 550000n, basisPoints: 4500n }));
  it("rounds completion up to whole contribution months", () => expect(completionMonths(550000n, 150000n)).toBe(4n));
  it("handles completed and paused contribution plans", () => { expect(completionMonths(0n, 0n)).toBe(0n); expect(completionMonths(100n, 0n)).toBeNull(); });
  it("rounds required savings up to the nearest cent", () => expect(requiredMonthly(1500000n, 21)).toBe(71429n));
});
