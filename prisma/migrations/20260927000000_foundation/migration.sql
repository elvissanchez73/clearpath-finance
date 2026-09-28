-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'HYSA', 'CASH', 'CREDIT_CARD', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'SAVINGS_TRANSFER', 'TRANSFER');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultIncomeMinor" BIGINT NOT NULL DEFAULT 0,
    "defaultSavingsMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "startingBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "institution" TEXT,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'circle',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "accountId" TEXT NOT NULL,
    "destinationAccountId" TEXT,
    "categoryId" TEXT,
    "note" TEXT,
    "recurringId" TEXT,
    "occurrenceDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "plannedIncomeMinor" BIGINT NOT NULL DEFAULT 0,
    "plannedSavingsMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetMinor" BIGINT,
    "startingAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "plannedContributionMinor" BIGINT NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "icon" TEXT NOT NULL DEFAULT 'target',
    "notes" TEXT,
    "accountId" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "frequency" "Frequency" NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "subscription" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetirementSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "annualSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "employeeBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "employerMatchBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "employerContributionBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "currentBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetirementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_id_userId_key" ON "UserSettings"("id", "userId");

-- CreateIndex
CREATE INDEX "Account_userId_archived_idx" ON "Account"("userId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_date_idx" ON "Transaction"("userId", "categoryId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_accountId_date_idx" ON "Transaction"("userId", "accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_userId_key" ON "Transaction"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recurringId_occurrenceDate_key" ON "Transaction"("recurringId", "occurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBudget_id_userId_key" ON "MonthlyBudget"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBudget_userId_month_key" ON "MonthlyBudget"("userId", "month");

-- CreateIndex
CREATE INDEX "BudgetItem_userId_idx" ON "BudgetItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_id_userId_key" ON "BudgetItem"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_budgetId_categoryId_key" ON "BudgetItem"("budgetId", "categoryId");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_priority_idx" ON "SavingsGoal"("userId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsGoal_id_userId_key" ON "SavingsGoal"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalContribution_transactionId_key" ON "GoalContribution"("transactionId");

-- CreateIndex
CREATE INDEX "GoalContribution_userId_goalId_idx" ON "GoalContribution"("userId", "goalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalContribution_transactionId_userId_key" ON "GoalContribution"("transactionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalContribution_id_userId_key" ON "GoalContribution"("id", "userId");

-- CreateIndex
CREATE INDEX "RecurringTransaction_userId_nextDueDate_idx" ON "RecurringTransaction"("userId", "nextDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTransaction_id_userId_key" ON "RecurringTransaction"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RetirementSettings_userId_key" ON "RetirementSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RetirementSettings_id_userId_key" ON "RetirementSettings"("id", "userId");

-- CreateIndex
CREATE INDEX "AccountBalanceSnapshot_userId_date_idx" ON "AccountBalanceSnapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBalanceSnapshot_id_userId_key" ON "AccountBalanceSnapshot"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBalanceSnapshot_accountId_date_key" ON "AccountBalanceSnapshot"("accountId", "date");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_destinationAccountId_userId_fkey" FOREIGN KEY ("destinationAccountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringId_userId_fkey" FOREIGN KEY ("recurringId", "userId") REFERENCES "RecurringTransaction"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyBudget" ADD CONSTRAINT "MonthlyBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_budgetId_userId_fkey" FOREIGN KEY ("budgetId", "userId") REFERENCES "MonthlyBudget"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "SavingsGoal"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetirementSettings" ADD CONSTRAINT "RetirementSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBalanceSnapshot" ADD CONSTRAINT "AccountBalanceSnapshot_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


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
