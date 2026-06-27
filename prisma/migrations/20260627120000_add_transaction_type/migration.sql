-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEBIT', 'CREDIT');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'DEBIT';
