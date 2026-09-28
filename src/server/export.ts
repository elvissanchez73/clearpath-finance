import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { exportInput, csvDocument } from "@/lib/export";
import { decimalInput } from "@/lib/ledger-validation";
export async function exportWorkspace(userId: string, input: unknown) {
  const filter = exportInput.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    if (filter.format === "csv") {
      const rows = await tx.transaction.findMany({ where: { userId, date: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }, include: { account: true, destinationAccount: true, category: true, contribution: { include: { goal: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
      const cells = rows.map(t => [t.id, t.date.toISOString().slice(0, 10), t.type, decimalInput(t.amountMinor), "USD", t.description, t.account.name, t.destinationAccount?.name ?? "", t.category?.name ?? "", t.contribution?.goal.name ?? "", t.note ?? "", t.grossIncomeMinor === null ? "" : decimalInput(t.grossIncomeMinor), t.deductionsMinor === null ? "" : decimalInput(t.deductionsMinor)]);
      return { filename: "ms-finances-transactions.csv", type: "text/csv; charset=utf-8", content: csvDocument([["ID", "Date", "Type", "Amount", "Currency", "Description", "Source account", "Destination account", "Category", "Goal", "Notes", "Gross income", "Deductions"], ...cells]) };
    }
    // Explicit allowlist: never export User passwords, sessions, reset tokens, or server configuration.
    const where = { userId };
    const data = {
      profile: await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
      settings: await tx.userSettings.findUnique({ where: { userId } }),
      accounts: await tx.account.findMany({ where }), categories: await tx.category.findMany({ where }), transactions: await tx.transaction.findMany({ where }),
      budgets: await tx.monthlyBudget.findMany({ where }), budgetItems: await tx.budgetItem.findMany({ where }),
      goals: await tx.savingsGoal.findMany({ where }), goalContributions: await tx.goalContribution.findMany({ where }),
      recurring: await tx.recurringTransaction.findMany({ where }), recurringOccurrences: await tx.recurringOccurrence.findMany({ where }),
      incomeSettings: await tx.incomeSettings.findUnique({ where: { userId } }), retirementSettings: await tx.retirementSettings.findUnique({ where: { userId } }), retirementContributions: await tx.retirementContribution.findMany({ where }),
      accountBalanceSnapshots: await tx.accountBalanceSnapshot.findMany({ where }),
    };
    return { filename: "ms-finances-workspace.json", type: "application/json; charset=utf-8", content: JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), currency: "USD", moneyEncoding: "Fields ending in Minor are integer strings in cents; percentage fields are integer basis points.", restoreSupported: false, data }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2) };
  });
}
