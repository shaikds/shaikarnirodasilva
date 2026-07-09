-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'SUPPLIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('PROPOSED', 'OPEN', 'CLOSED', 'EXPIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AgentAction" AS ENUM ('PROPOSE_DEAL', 'OPEN_DEAL', 'BLOCK_DEAL', 'CLOSE_DEAL', 'EXPIRE_DEAL', 'ADJUST_TRUST', 'SKIP');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('ALLOWED', 'BLOCKED_BY_GUARDRAIL', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "countryCode" TEXT NOT NULL DEFAULT 'IL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "trustScore" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "imageUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "listPrice" DECIMAL(12,2) NOT NULL,
    "floorPrice" DECIMAL(12,2) NOT NULL,
    "maxDiscountPct" INTEGER NOT NULL DEFAULT 40,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketReference" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "typicalPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryPPP" (
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "pppFactor" DECIMAL(6,3) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "CountryPPP_pkey" PRIMARY KEY ("countryCode")
);

-- CreateTable
CREATE TABLE "DemandSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'PROPOSED',
    "groupPrice" DECIMAL(12,2) NOT NULL,
    "referencePrice" DECIMAL(12,2) NOT NULL,
    "discountPct" INTEGER NOT NULL,
    "fairnessScore" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IL',
    "targetSize" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "aiRationale" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponCode" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "dealId" TEXT,
    "code" TEXT NOT NULL,
    "assignedTo" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "action" "AgentAction" NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "productId" TEXT,
    "dealId" TEXT,
    "supplierId" TEXT,
    "reasons" TEXT[],
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_recordedAt_idx" ON "PriceHistory"("productId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketReference_category_countryCode_key" ON "MarketReference"("category", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "DemandSignal_userId_productId_key" ON "DemandSignal"("userId", "productId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_dealId_userId_key" ON "GroupMembership"("dealId", "userId");

-- CreateIndex
CREATE INDEX "CouponCode_assignedTo_idx" ON "CouponCode"("assignedTo");

-- CreateIndex
CREATE UNIQUE INDEX "CouponCode_productId_code_key" ON "CouponCode"("productId", "code");

-- CreateIndex
CREATE INDEX "AgentDecision_runId_idx" ON "AgentDecision"("runId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandSignal" ADD CONSTRAINT "DemandSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandSignal" ADD CONSTRAINT "DemandSignal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
