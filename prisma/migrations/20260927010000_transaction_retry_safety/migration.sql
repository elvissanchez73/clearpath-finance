ALTER TABLE "Transaction" ADD COLUMN "clientRequestId" UUID;
CREATE UNIQUE INDEX "Transaction_userId_clientRequestId_key" ON "Transaction"("userId", "clientRequestId");
