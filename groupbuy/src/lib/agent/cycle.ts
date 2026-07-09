import { prisma } from "@/lib/db";
import { verifyFairness } from "@/lib/fairness/verify";
import { computeGroupPrice } from "@/lib/pricing/engine";
import { getLlmProvider, LlmError, MockProvider, type OpportunityInput } from "@/lib/llm";
import { checkCloseDeal, checkOpenDeal, defaultLimits } from "./guardrails";
import type { Prisma } from "@prisma/client";

/**
 * One full autonomous agent cycle. Every step that acts on the world is
 * guarded and audited:
 *
 *   1. expire stale OPEN deals past their deadline
 *   2. close OPEN deals that reached their target (assign coupon codes)
 *   3. discover new opportunities from demand signals
 *      -> fairness verification (deterministic)
 *      -> pricing (deterministic)
 *      -> LLM ranking (untrusted, schema-bound; falls back to MockProvider)
 *      -> guardrails (deterministic)
 *      -> open deals for survivors
 *   4. lower trust score of suppliers whose products were blocked for
 *      fairness violations
 *
 * The kill switch is re-read from the DB before every mutating action.
 */

const DEAL_DURATION_DAYS = 7;
const TRUST_PENALTY = 15;

export interface CycleSummary {
  runId: string;
  expired: number;
  closed: number;
  opened: number;
  blocked: number;
  llmProvider: string;
  llmFellBack: boolean;
}

async function killSwitchOn(): Promise<boolean> {
  const s = await prisma.systemSetting.findUnique({ where: { key: "agent_kill_switch" } });
  return s?.value === "on";
}

export async function runAgentCycle(triggeredBy: string): Promise<CycleSummary> {
  const limits = defaultLimits();
  let provider = getLlmProvider();
  let llmFellBack = false;

  const run = await prisma.agentRun.create({
    data: { triggeredBy, llmProvider: provider.name },
  });

  let actionsUsed = 0;
  let expired = 0;
  let closed = 0;
  let opened = 0;
  let blocked = 0;

  const record = (data: Omit<Prisma.AgentDecisionUncheckedCreateInput, "runId">) =>
    prisma.agentDecision.create({ data: { ...data, runId: run.id } });

  const now = new Date();

  // ---- 1. Expire stale deals ----
  const stale = await prisma.deal.findMany({
    where: { status: "OPEN", deadline: { lt: now } },
    include: { _count: { select: { memberships: true } } },
  });
  for (const deal of stale) {
    if (await killSwitchOn()) {
      await record({ action: "EXPIRE_DEAL", outcome: "BLOCKED_BY_GUARDRAIL", dealId: deal.id, reasons: ["KILL_SWITCH_ON"], detail: {} });
      continue;
    }
    await prisma.deal.update({ where: { id: deal.id }, data: { status: "EXPIRED" } });
    await record({
      action: "EXPIRE_DEAL",
      outcome: "ALLOWED",
      dealId: deal.id,
      reasons: [],
      detail: { members: deal._count.memberships, target: deal.targetSize },
    });
    expired++;
    actionsUsed++;
  }

  // ---- 2. Close deals that reached target ----
  const openDeals = await prisma.deal.findMany({
    where: { status: "OPEN" },
    include: { memberships: true, product: true },
  });
  for (const deal of openDeals) {
    if (deal.memberships.length < deal.targetSize) continue;
    const availableCodes = await prisma.couponCode.count({
      where: { productId: deal.productId, assignedTo: null },
    });
    const verdict = checkCloseDeal({
      killSwitchOn: await killSwitchOn(),
      memberCount: deal.memberships.length,
      targetSize: deal.targetSize,
      availableCouponCodes: availableCodes,
    });
    if (!verdict.allowed) {
      await record({
        action: "CLOSE_DEAL",
        outcome: "BLOCKED_BY_GUARDRAIL",
        dealId: deal.id,
        supplierId: deal.product.supplierId,
        reasons: verdict.violations,
        detail: { members: deal.memberships.length, availableCodes },
      });
      blocked++;
      continue;
    }
    // Assign one coupon code per member atomically with the close.
    await prisma.$transaction(async (tx) => {
      const codes = await tx.couponCode.findMany({
        where: { productId: deal.productId, assignedTo: null },
        take: deal.memberships.length,
        orderBy: { createdAt: "asc" },
      });
      if (codes.length < deal.memberships.length) throw new Error("coupon pool drained concurrently");
      await Promise.all(
        deal.memberships.map((m, i) =>
          tx.couponCode.update({
            where: { id: codes[i].id },
            data: { assignedTo: m.userId, dealId: deal.id, assignedAt: new Date() },
          })
        )
      );
      await tx.deal.update({ where: { id: deal.id }, data: { status: "CLOSED", closedAt: new Date() } });
    });
    await record({
      action: "CLOSE_DEAL",
      outcome: "ALLOWED",
      dealId: deal.id,
      supplierId: deal.product.supplierId,
      reasons: [],
      detail: { members: deal.memberships.length, couponsAssigned: deal.memberships.length },
    });
    closed++;
    actionsUsed++;
  }

  // ---- 3. Discover & open new deals ----
  const candidates = await prisma.product.findMany({
    where: {
      active: true,
      stock: { gt: 0 },
      deals: { none: { status: { in: ["OPEN", "PROPOSED"] } } },
      demandSignals: { some: {} },
    },
    include: {
      supplier: true,
      priceHistory: true,
      _count: { select: { demandSignals: true } },
    },
  });

  const country = await prisma.countryPPP.findUnique({ where: { countryCode: "IL" } });
  const pppFactor = country ? Number(country.pppFactor) : 1;

  type Candidate = {
    productId: string;
    supplierId: string;
    fairness: ReturnType<typeof verifyFairness>;
    pricing: ReturnType<typeof computeGroupPrice>;
    demandCount: number;
    stock: number;
    opportunity: OpportunityInput;
  };
  const viable: Candidate[] = [];

  for (const product of candidates) {
    const market = await prisma.marketReference.findUnique({
      where: { category_countryCode: { category: product.category, countryCode: "IL" } },
    });

    const fairness = verifyFairness({
      claimedListPrice: Number(product.listPrice),
      floorPrice: Number(product.floorPrice),
      marketReferencePrice: market ? Number(market.typicalPrice) : null,
      priceHistory: product.priceHistory.map((p) => ({ listPrice: Number(p.listPrice), recordedAt: p.recordedAt })),
    });

    const pricing = computeGroupPrice({
      floorPrice: Number(product.floorPrice),
      referencePrice: fairness.referencePrice,
      groupSize: Math.max(product._count.demandSignals, 2),
      pppFactor,
      maxDiscountPct: product.maxDiscountPct,
      minRealDiscountPct: limits.minRealDiscountPct,
    });

    if (!fairness.fair) {
      await record({
        action: "PROPOSE_DEAL",
        outcome: "BLOCKED_BY_GUARDRAIL",
        productId: product.id,
        supplierId: product.supplierId,
        reasons: fairness.flags,
        detail: {
          fairnessScore: fairness.score,
          referencePrice: fairness.referencePrice,
          claimedListPrice: Number(product.listPrice),
        },
      });
      blocked++;
      // ---- 4. Trust penalty for fairness violations ----
      const newTrust = Math.max(0, product.supplier.trustScore - TRUST_PENALTY);
      await prisma.supplier.update({ where: { id: product.supplierId }, data: { trustScore: newTrust } });
      await record({
        action: "ADJUST_TRUST",
        outcome: "ALLOWED",
        supplierId: product.supplierId,
        reasons: fairness.flags,
        detail: { from: product.supplier.trustScore, to: newTrust },
      });
      continue;
    }
    if (!pricing.ok) {
      await record({
        action: "PROPOSE_DEAL",
        outcome: "SKIPPED",
        productId: product.id,
        supplierId: product.supplierId,
        reasons: pricing.reasons,
        detail: { groupPrice: pricing.groupPrice, discountPct: pricing.discountPct },
      });
      continue;
    }

    viable.push({
      productId: product.id,
      supplierId: product.supplierId,
      fairness,
      pricing,
      demandCount: product._count.demandSignals,
      stock: product.stock,
      opportunity: {
        productRef: product.id,
        category: product.category,
        demandCount: product._count.demandSignals,
        stock: product.stock,
        achievableDiscountPct: pricing.discountPct,
        fairnessScore: fairness.score,
        supplierTrustScore: product.supplier.trustScore,
        productName: product.name,
        productDescription: product.description,
      },
    });
  }

  // LLM ranks the viable candidates; on failure fall back to the mock.
  let ranking;
  if (viable.length > 0) {
    try {
      ranking = await provider.rankOpportunities(viable.map((v) => v.opportunity));
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      llmFellBack = true;
      provider = new MockProvider();
      ranking = await provider.rankOpportunities(viable.map((v) => v.opportunity));
    }
  } else {
    ranking = { opportunities: [] };
  }

  for (const ranked of ranking.opportunities) {
    const cand = viable.find((v) => v.productId === ranked.productRef);
    if (!cand) continue; // hallucinated ref — ignore

    // targetSize comes from the LLM: re-clamp it deterministically.
    const targetSize = Math.max(2, Math.min(ranked.targetSize, cand.stock, Math.max(cand.demandCount * 3, 2), 500));

    const supplier = await prisma.supplier.findUnique({ where: { id: cand.supplierId } });
    const supplierOpenDeals = await prisma.deal.count({
      where: { status: "OPEN", product: { supplierId: cand.supplierId } },
    });
    const availableCodes = await prisma.couponCode.count({
      where: { productId: cand.productId, assignedTo: null },
    });

    const verdict = checkOpenDeal(
      {
        killSwitchOn: await killSwitchOn(),
        actionsUsedThisCycle: actionsUsed,
        supplierVerified: supplier?.verified ?? false,
        supplierTrustScore: supplier?.trustScore ?? 0,
        supplierOpenDeals,
        fairnessOk: cand.fairness.fair,
        fairnessScore: cand.fairness.score,
        pricingOk: cand.pricing.ok,
        groupPrice: cand.pricing.groupPrice,
        floorPrice: Number((await prisma.product.findUnique({ where: { id: cand.productId } }))?.floorPrice ?? Infinity),
        discountPct: cand.pricing.discountPct,
        targetSize,
        availableCouponCodes: availableCodes,
        stock: cand.stock,
      },
      limits
    );

    if (!verdict.allowed) {
      await record({
        action: "OPEN_DEAL",
        outcome: "BLOCKED_BY_GUARDRAIL",
        productId: cand.productId,
        supplierId: cand.supplierId,
        reasons: verdict.violations,
        detail: { targetSize, groupPrice: cand.pricing.groupPrice },
      });
      blocked++;
      continue;
    }

    const deal = await prisma.deal.create({
      data: {
        productId: cand.productId,
        status: "OPEN",
        groupPrice: cand.pricing.groupPrice,
        referencePrice: cand.fairness.referencePrice,
        discountPct: cand.pricing.discountPct,
        fairnessScore: cand.fairness.score,
        countryCode: "IL",
        targetSize,
        deadline: new Date(Date.now() + DEAL_DURATION_DAYS * 86_400_000),
        aiRationale: ranked.rationale,
      },
    });
    await record({
      action: "OPEN_DEAL",
      outcome: "ALLOWED",
      productId: cand.productId,
      supplierId: cand.supplierId,
      dealId: deal.id,
      reasons: [],
      detail: {
        groupPrice: cand.pricing.groupPrice,
        referencePrice: cand.fairness.referencePrice,
        discountPct: cand.pricing.discountPct,
        fairnessScore: cand.fairness.score,
        targetSize,
        priority: ranked.priority,
      },
    });
    opened++;
    actionsUsed++;
  }

  const summary: CycleSummary = {
    runId: run.id,
    expired,
    closed,
    opened,
    blocked,
    llmProvider: provider.name,
    llmFellBack,
  };
  await prisma.agentRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), summary: JSON.stringify(summary) },
  });
  return summary;
}
