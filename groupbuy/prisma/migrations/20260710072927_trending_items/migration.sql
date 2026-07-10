-- CreateEnum
CREATE TYPE "TrendingSource" AS ENUM ('KSP', 'SUPER_PHARM', 'ZAP');

-- CreateEnum
CREATE TYPE "TrendingStatus" AS ENUM ('LISTED', 'CLAIMABLE', 'CLAIM_WINDOW', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'WON', 'LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentAction" ADD VALUE 'EXPIRE_TRENDING';
ALTER TYPE "AgentAction" ADD VALUE 'ACTIVATE_TRENDING';
ALTER TYPE "AgentAction" ADD VALUE 'RESOLVE_CLAIM';

-- CreateTable
CREATE TABLE "TrendingItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" "TrendingSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePriceIls" DECIMAL(12,2) NOT NULL,
    "zapLowestPriceIls" DECIMAL(12,2),
    "rating" DECIMAL(3,1),
    "reviewCount" INTEGER,
    "status" "TrendingStatus" NOT NULL DEFAULT 'LISTED',
    "votesNeeded" INTEGER,
    "claimWindowEndsAt" TIMESTAMP(3),
    "productId" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trendingItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOffer" (
    "id" TEXT NOT NULL,
    "trendingItemId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "floorPrice" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL,
    "freeShipping" BOOLEAN NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendingItem_status_idx" ON "TrendingItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingItem_source_externalId_key" ON "TrendingItem"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingVote_userId_trendingItemId_key" ON "TrendingVote"("userId", "trendingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOffer_trendingItemId_supplierId_key" ON "SupplierOffer"("trendingItemId", "supplierId");

-- AddForeignKey
ALTER TABLE "TrendingVote" ADD CONSTRAINT "TrendingVote_trendingItemId_fkey" FOREIGN KEY ("trendingItemId") REFERENCES "TrendingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_trendingItemId_fkey" FOREIGN KEY ("trendingItemId") REFERENCES "TrendingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
