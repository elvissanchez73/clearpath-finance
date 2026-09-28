ALTER TABLE "UserSettings" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "defaultBudgetSavingsMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "UserSettings" ADD CONSTRAINT "onboarding_step_range" CHECK ("onboardingStep" BETWEEN 0 AND 4),
 ADD CONSTRAINT "default_budget_savings_nonnegative" CHECK ("defaultBudgetSavingsMinor" >= 0);
ALTER TABLE "RetirementContribution" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "clientRequestId" UUID;
CREATE UNIQUE INDEX "RetirementContribution_userId_clientRequestId_key" ON "RetirementContribution"("userId", "clientRequestId");
