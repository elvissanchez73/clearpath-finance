ALTER TABLE "Transaction" ADD COLUMN "grossIncomeMinor" BIGINT, ADD COLUMN "deductionsMinor" BIGINT;
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_payroll CHECK (
 ("grossIncomeMinor" IS NULL AND "deductionsMinor" IS NULL) OR
 (type = 'INCOME' AND "grossIncomeMinor" IS NOT NULL AND "deductionsMinor" IS NOT NULL AND "deductionsMinor" >= 0 AND "grossIncomeMinor" - "deductionsMinor" = "amountMinor")
);
ALTER TABLE "RecurringTransaction" ADD COLUMN "destinationAccountId" TEXT, ADD COLUMN "goalId" TEXT,
 ADD COLUMN "grossIncomeMinor" BIGINT, ADD COLUMN "deductionsMinor" BIGINT,
 ADD COLUMN "anchorDay" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "anchorMonth" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "secondDay" INTEGER, ADD COLUMN "lastError" TEXT;
UPDATE "RecurringTransaction" SET "anchorDay" = EXTRACT(DAY FROM "nextDueDate"), "anchorMonth" = EXTRACT(MONTH FROM "nextDueDate");
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_destinationAccountId_userId_fkey" FOREIGN KEY ("destinationAccountId", "userId") REFERENCES "Account"(id, "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "RecurringTransaction_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "SavingsGoal"(id, "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT recurring_anchor CHECK ("anchorDay" BETWEEN 1 AND 31 AND "anchorMonth" BETWEEN 1 AND 12 AND ("secondDay" IS NULL OR (frequency = 'MONTHLY' AND "secondDay" > "anchorDay" AND "secondDay" <= 31))),
 ADD CONSTRAINT recurring_payroll CHECK (("grossIncomeMinor" IS NULL AND "deductionsMinor" IS NULL) OR (type = 'INCOME' AND "grossIncomeMinor" IS NOT NULL AND "deductionsMinor" IS NOT NULL AND "deductionsMinor" >= 0 AND "grossIncomeMinor" - "deductionsMinor" = "amountMinor")),
 ADD CONSTRAINT recurring_goal_type CHECK ("goalId" IS NULL OR type = 'SAVINGS_TRANSFER'),
 ADD CONSTRAINT recurring_subscription_type CHECK (NOT subscription OR type = 'EXPENSE');
-- Legacy transfer plans lack a destination; leave them inactive until explicitly repaired.
UPDATE "RecurringTransaction" SET active = false, "lastError" = 'Choose a destination account before activating this transfer.' WHERE type IN ('TRANSFER', 'SAVINGS_TRANSFER') AND "destinationAccountId" IS NULL;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT recurring_destination CHECK (
 (type IN ('TRANSFER', 'SAVINGS_TRANSFER') AND ((NOT active AND "destinationAccountId" IS NULL) OR ("destinationAccountId" IS NOT NULL AND "destinationAccountId" <> "accountId")) AND "categoryId" IS NULL)
 OR (type IN ('INCOME', 'EXPENSE') AND "destinationAccountId" IS NULL)
);
CREATE TABLE "RecurringOccurrence" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "recurringId" TEXT NOT NULL, date DATE NOT NULL,
 skipped BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RecurringOccurrence_recurringId_userId_fkey" FOREIGN KEY ("recurringId", "userId") REFERENCES "RecurringTransaction"(id, "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecurringOccurrence_recurringId_date_key" ON "RecurringOccurrence"("recurringId", date);
CREATE UNIQUE INDEX "RecurringOccurrence_id_userId_key" ON "RecurringOccurrence"(id, "userId");
CREATE INDEX "RecurringOccurrence_userId_idx" ON "RecurringOccurrence"("userId");
INSERT INTO "RecurringOccurrence" (id, "userId", "recurringId", date)
 SELECT 'migrated-' || id, "userId", "recurringId", "occurrenceDate" FROM "Transaction" WHERE "recurringId" IS NOT NULL AND "occurrenceDate" IS NOT NULL;
CREATE TABLE "IncomeSettings" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "annualSalaryMinor" BIGINT NOT NULL DEFAULT 0,
 "netPaycheckMinor" BIGINT NOT NULL DEFAULT 0, "payFrequency" TEXT NOT NULL DEFAULT 'BIWEEKLY', "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "IncomeSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT income_settings_amounts CHECK ("annualSalaryMinor" >= 0 AND "netPaycheckMinor" >= 0 AND "payFrequency" IN ('WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY'))
);
CREATE UNIQUE INDEX "IncomeSettings_id_userId_key" ON "IncomeSettings"(id, "userId");
CREATE TABLE "RetirementContribution" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, date DATE NOT NULL,
 "employeeMinor" BIGINT NOT NULL, "employerMatchMinor" BIGINT NOT NULL DEFAULT 0, "employerOtherMinor" BIGINT NOT NULL DEFAULT 0,
 notes TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RetirementContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT retirement_contribution_amounts CHECK ("employeeMinor" >= 0 AND "employerMatchMinor" >= 0 AND "employerOtherMinor" >= 0 AND "employeeMinor" + "employerMatchMinor" + "employerOtherMinor" > 0)
);
CREATE UNIQUE INDEX "RetirementContribution_id_userId_key" ON "RetirementContribution"(id, "userId");
CREATE INDEX "RetirementContribution_userId_date_idx" ON "RetirementContribution"("userId", date);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['RecurringOccurrence','IncomeSettings','RetirementContribution'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY owner_isolation ON %I USING ("userId" = NULLIF(current_setting(''app.user_id'', true), '''')) WITH CHECK ("userId" = NULLIF(current_setting(''app.user_id'', true), ''''))', t);
 END LOOP;
END $$;
