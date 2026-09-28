export function contentSecurityPolicy(nonce: string, development: boolean) {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) throw new Error("Invalid nonce");
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'${development ? "" : "; upgrade-insecure-requests"}`;
}
export const financialTables = ["UserSettings", "Account", "Category", "Transaction", "MonthlyBudget", "BudgetItem", "SavingsGoal", "GoalContribution", "RecurringTransaction", "RecurringOccurrence", "IncomeSettings", "RetirementContribution", "RetirementSettings", "AccountBalanceSnapshot"];
