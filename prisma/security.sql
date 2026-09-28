-- Every financial table fails closed unless a transaction-local owner is set.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['UserSettings', 'Account', 'Category', 'Transaction', 'MonthlyBudget', 'BudgetItem', 'SavingsGoal', 'GoalContribution', 'RecurringTransaction', 'RetirementSettings', 'AccountBalanceSnapshot']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY owner_isolation ON %I USING ("userId" = NULLIF(current_setting(''app.user_id'', true), '''')) WITH CHECK ("userId" = NULLIF(current_setting(''app.user_id'', true), ''''))', table_name);
  END LOOP;
END $$;

ALTER TABLE "Transaction" ADD CONSTRAINT transaction_positive CHECK ("amountMinor" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_destination CHECK (
  (type IN ('TRANSFER', 'SAVINGS_TRANSFER') AND "destinationAccountId" IS NOT NULL AND "destinationAccountId" <> "accountId" AND "categoryId" IS NULL)
  OR (type IN ('INCOME', 'EXPENSE') AND "destinationAccountId" IS NULL)
);
ALTER TABLE "MonthlyBudget" ADD CONSTRAINT budget_month_start CHECK (EXTRACT(DAY FROM month) = 1);
ALTER TABLE "MonthlyBudget" ADD CONSTRAINT budget_nonnegative CHECK ("plannedIncomeMinor" >= 0 AND "plannedSavingsMinor" >= 0);
ALTER TABLE "BudgetItem" ADD CONSTRAINT budget_item_nonnegative CHECK ("amountMinor" >= 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT goal_amounts CHECK (("targetMinor" IS NULL OR "targetMinor" > 0) AND "startingAmountMinor" >= 0 AND "plannedContributionMinor" >= 0 AND priority > 0 AND (status = 'PAUSED' OR "targetMinor" IS NOT NULL));
ALTER TABLE "UserSettings" ADD CONSTRAINT settings_values CHECK (currency = 'USD' AND theme IN ('light', 'dark', 'system') AND "defaultIncomeMinor" >= 0 AND "defaultSavingsMinor" >= 0);
ALTER TABLE "Account" ADD CONSTRAINT account_currency CHECK (currency = 'USD');
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT recurring_amount CHECK ("amountMinor" > 0);
ALTER TABLE "RetirementSettings" ADD CONSTRAINT retirement_values CHECK ("annualSalaryMinor" >= 0 AND "employeeBasisPoints" BETWEEN 0 AND 10000 AND "employerMatchBasisPoints" BETWEEN 0 AND 10000 AND "employerContributionBasisPoints" BETWEEN 0 AND 10000);

CREATE FUNCTION validate_goal_contribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Transaction" WHERE id = NEW."transactionId" AND "userId" = NEW."userId" AND type = 'SAVINGS_TRANSFER') THEN
    RAISE EXCEPTION 'Goal contribution requires a savings transfer' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contribution_type_check BEFORE INSERT OR UPDATE ON "GoalContribution" FOR EACH ROW EXECUTE FUNCTION validate_goal_contribution();

CREATE FUNCTION protect_contributed_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type <> 'SAVINGS_TRANSFER' AND EXISTS (SELECT 1 FROM "GoalContribution" WHERE "transactionId" = NEW.id AND "userId" = NEW."userId") THEN
    RAISE EXCEPTION 'Remove goal assignment before changing savings transaction type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contributed_transaction_check BEFORE UPDATE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION protect_contributed_transaction();
