import { prisma } from "@/lib/db";
import { computeGroupPrice } from "@/lib/pricing/engine";
import { computeActivationThreshold, estimateFloorPrice } from "@/lib/trending/threshold";
import { trendingConfig } from "@/lib/trending/config";
import { checkTrendingOffer, type GuardrailLimits } from "./guardrails";
import type { Prisma } from "@prisma/client";

/**
 * Trending-item steps of the agent cycle:
 *
 *   T1. expire stale trending items (14d unclaimed / 7d with zero votes)
 *   T2. activate: recompute the deterministic win-win vote threshold for
 *       LISTED items; enough votes => CLAIMABLE (suppliers may now offer)
 *   T3. resolve claim windows that have ended: score every pending offer with
 *       the pricing engine, guardrail-check it, pick the offer that gives
 *       members the LOWEST verified price (ties -> higher trust score), and
 *       convert the item into a real Product + demand signals. The regular
 *       discovery pipeline then opens the deal through the standard
 *       guardrails once the winner uploads coupon codes.
 *
 * The supplier never sets the price: the engine's number, anchored to the
 * scraped Zap lowest market price, is final. Free shipping is mandatory.
 */

/** Suppliers accept the engine's price when offering; cap discount generously. */
const TRENDING_MAX_DISCOUNT_PCT = 90;
/** Trending references are externally verified market prices — high fairness. */
const TRENDING_FAIRNESS_SCORE = 95;

export interface TrendingStepResult {
  trendingExpired: number;
  trendingActivated: number;
  trendingConverted: number;
  trendingBlocked: number;
}

interface Deps {
  record: (data: Omit<Prisma.AgentDecisionUncheckedCreateInput, "runId">) => Promise<unknown>;
  killSwitchOn: () => Promise<boolean>;
  limits: GuardrailLimits;
  pppFactor: number;
}

export async function processTrendingSteps({ record, killSwitchOn, limits, pppFactor }: Deps): Promise<TrendingStepResult> {
  const cfg = trendingConfig();
  const result: TrendingStepResult = {
    trendingExpired: 0,
    trendingActivated: 0,
    trendingConverted: 0,
    trendingBlocked: 0,
  };
  const now = Date.now();

  // ---- T1. Expire stale trending items (audited per item) ----
  const stale = await prisma.trendingItem.findMany({
    where: {
      OR: [
        { status: { in: ["LISTED", "CLAIMABLE"] }, createdAt: { lt: new Date(now - cfg.unclaimedExpiryDays * 86_400_000) } },
        { status: "LISTED", createdAt: { lt: new Date(now - cfg.zeroVoteExpiryDays * 86_400_000) }, votes: { none: {} } },
      ],
    },
    include: { _count: { select: { votes: true } } },
  });
  for (const item of stale) {
    if (await killSwitchOn()) {
      await record({ action: "EXPIRE_TRENDING", outcome: "BLOCKED_BY_GUARDRAIL", reasons: ["KILL_SWITCH_ON"], detail: { trendingItemId: item.id } });
      continue;
    }
    await prisma.trendingItem.update({ where: { id: item.id }, data: { status: "EXPIRED" } });
    await record({
      action: "EXPIRE_TRENDING",
      outcome: "ALLOWED",
      reasons: [],
      detail: { trendingItemId: item.id, title: item.title, votes: item._count.votes, ageDays: Math.round((now - item.createdAt.getTime()) / 86_400_000) },
    });
    result.trendingExpired++;
  }

  // ---- T2. Recompute thresholds & activate ----
  const listed = await prisma.trendingItem.findMany({
    where: { status: "LISTED" },
    include: { _count: { select: { votes: true } }, offers: { where: { status: "PENDING" } } },
  });
  for (const item of listed) {
    if (item.zapLowestPriceIls == null) continue; // unverified price -> cannot activate
    const marketPrice = Number(item.zapLowestPriceIls);
    const bestOfferFloor = item.offers.length > 0 ? Math.min(...item.offers.map((o) => Number(o.floorPrice))) : null;
    const votesNeeded = computeActivationThreshold({
      zapLowestPriceIls: marketPrice,
      floorPrice: bestOfferFloor ?? estimateFloorPrice(marketPrice),
      pppFactor,
      maxDiscountPct: TRENDING_MAX_DISCOUNT_PCT,
      minRealDiscountPct: limits.minRealDiscountPct,
    });
    if (votesNeeded !== item.votesNeeded) {
      await prisma.trendingItem.update({ where: { id: item.id }, data: { votesNeeded } });
    }
    if (votesNeeded === null || item._count.votes < votesNeeded) continue;

    if (await killSwitchOn()) {
      await record({ action: "ACTIVATE_TRENDING", outcome: "BLOCKED_BY_GUARDRAIL", reasons: ["KILL_SWITCH_ON"], detail: { trendingItemId: item.id } });
      continue;
    }
    await prisma.trendingItem.update({ where: { id: item.id }, data: { status: "CLAIMABLE" } });
    await record({
      action: "ACTIVATE_TRENDING",
      outcome: "ALLOWED",
      reasons: [],
      detail: { trendingItemId: item.id, title: item.title, votes: item._count.votes, votesNeeded, marketPrice },
    });
    result.trendingActivated++;
  }

  // ---- T3. Resolve ended claim windows ----
  const windows = await prisma.trendingItem.findMany({
    where: { status: "CLAIM_WINDOW", claimWindowEndsAt: { lt: new Date(now) } },
    include: {
      _count: { select: { votes: true } },
      votes: true,
      offers: { where: { status: "PENDING" } },
    },
  });

  for (const item of windows) {
    if (item.zapLowestPriceIls == null) continue;
    const marketPrice = Number(item.zapLowestPriceIls);
    const groupSize = Math.max(item._count.votes, 2);

    type Scored = {
      offerId: string;
      supplierId: string;
      floorPrice: number;
      stock: number;
      groupPrice: number;
      discountPct: number;
      trustScore: number;
      violations: string[];
    };
    const scoredOffers: Scored[] = [];

    for (const offer of item.offers) {
      const supplier = await prisma.supplier.findUnique({ where: { id: offer.supplierId } });
      const pricing = computeGroupPrice({
        floorPrice: Number(offer.floorPrice),
        referencePrice: marketPrice,
        groupSize,
        pppFactor,
        maxDiscountPct: TRENDING_MAX_DISCOUNT_PCT,
        minRealDiscountPct: limits.minRealDiscountPct,
      });
      const verdict = checkTrendingOffer(
        {
          killSwitchOn: await killSwitchOn(),
          supplierVerified: supplier?.verified ?? false,
          supplierTrustScore: supplier?.trustScore ?? 0,
          freeShipping: offer.freeShipping,
          floorPrice: Number(offer.floorPrice),
          marketPrice,
          computedGroupPrice: pricing.groupPrice,
          pricingOk: pricing.ok,
          stock: offer.stock,
          targetSize: groupSize,
        },
        limits,
      );
      scoredOffers.push({
        offerId: offer.id,
        supplierId: offer.supplierId,
        floorPrice: Number(offer.floorPrice),
        stock: offer.stock,
        groupPrice: pricing.groupPrice,
        discountPct: pricing.discountPct,
        trustScore: supplier?.trustScore ?? 0,
        violations: verdict.violations,
      });
    }

    const passing = scoredOffers
      .filter((o) => o.violations.length === 0)
      .sort((a, b) => a.groupPrice - b.groupPrice || b.trustScore - a.trustScore);
    const winner = passing[0] ?? null;

    // Audit every failed offer so suppliers can see exactly why they lost.
    for (const o of scoredOffers) {
      if (o.violations.length === 0) continue;
      await record({
        action: "RESOLVE_CLAIM",
        outcome: "BLOCKED_BY_GUARDRAIL",
        supplierId: o.supplierId,
        reasons: o.violations,
        detail: { trendingItemId: item.id, offerId: o.offerId, groupPrice: o.groupPrice, marketPrice },
      });
      result.trendingBlocked++;
    }

    if (!winner) {
      // Nobody qualified: mark failed offers LOST, reopen for new offers.
      await prisma.$transaction([
        prisma.supplierOffer.updateMany({ where: { trendingItemId: item.id, status: "PENDING" }, data: { status: "LOST" } }),
        prisma.trendingItem.update({ where: { id: item.id }, data: { status: "CLAIMABLE", claimWindowEndsAt: null } }),
      ]);
      await record({
        action: "RESOLVE_CLAIM",
        outcome: "SKIPPED",
        reasons: ["NO_QUALIFYING_OFFER"],
        detail: { trendingItemId: item.id, title: item.title, offersConsidered: scoredOffers.length },
      });
      continue;
    }

    if (await killSwitchOn()) {
      await record({ action: "RESOLVE_CLAIM", outcome: "BLOCKED_BY_GUARDRAIL", reasons: ["KILL_SWITCH_ON"], detail: { trendingItemId: item.id } });
      continue;
    }

    // Convert atomically: Product + price history + market reference + demand
    // signals from votes; offers settled; item CONVERTED. The regular
    // discovery pipeline opens the deal once the winner uploads coupon codes.
    const productId = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          supplierId: winner.supplierId,
          name: item.title,
          description: `Trending pick (${item.source}) — verified market price ₪${marketPrice}. Free shipping included.`,
          category: item.category,
          listPrice: marketPrice,
          floorPrice: winner.floorPrice,
          maxDiscountPct: TRENDING_MAX_DISCOUNT_PCT,
          stock: winner.stock,
        },
      });
      await tx.priceHistory.create({ data: { productId: product.id, listPrice: marketPrice } });
      await tx.marketReference.upsert({
        where: { category_countryCode: { category: item.category, countryCode: "IL" } },
        update: { typicalPrice: marketPrice, source: `zap:${item.externalId}` },
        create: { category: item.category, countryCode: "IL", typicalPrice: marketPrice, source: `zap:${item.externalId}` },
      });
      if (item.votes.length > 0) {
        await tx.demandSignal.createMany({
          data: item.votes.map((v) => ({ userId: v.userId, productId: product.id })),
          skipDuplicates: true,
        });
      }
      await tx.supplierOffer.update({ where: { id: winner.offerId }, data: { status: "WON" } });
      await tx.supplierOffer.updateMany({
        where: { trendingItemId: item.id, status: "PENDING", id: { not: winner.offerId } },
        data: { status: "LOST" },
      });
      await tx.trendingItem.update({
        where: { id: item.id },
        data: { status: "CONVERTED", productId: product.id },
      });
      return product.id;
    });

    await record({
      action: "RESOLVE_CLAIM",
      outcome: "ALLOWED",
      productId,
      supplierId: winner.supplierId,
      reasons: [],
      detail: {
        trendingItemId: item.id,
        title: item.title,
        winnerOfferId: winner.offerId,
        memberPrice: winner.groupPrice,
        discountPct: winner.discountPct,
        marketPrice,
        votes: item._count.votes,
        offersConsidered: scoredOffers.length,
        fairnessScore: TRENDING_FAIRNESS_SCORE,
      },
    });
    result.trendingConverted++;
  }

  return result;
}
