/**
 * Deterministic guardrails for the autonomous agent.
 *
 * Every agent action passes through checkGuardrails() BEFORE it executes.
 * The LLM can rank and explain, but it cannot bypass, weaken, or even see
 * this layer. All violations are returned as machine-readable codes and are
 * persisted to the AgentDecision audit trail by the caller.
 */

export interface GuardrailLimits {
  maxActionsPerCycle: number;
  maxOpenDealsPerSupplier: number;
  minTrustScore: number;
  minRealDiscountPct: number;
}

export interface OpenDealCheck {
  killSwitchOn: boolean;
  actionsUsedThisCycle: number;
  supplierVerified: boolean;
  supplierTrustScore: number;
  supplierOpenDeals: number;
  fairnessOk: boolean;
  fairnessScore: number;
  pricingOk: boolean;
  groupPrice: number;
  floorPrice: number;
  discountPct: number;
  targetSize: number;
  availableCouponCodes: number;
  stock: number;
}

export interface GuardrailVerdict {
  allowed: boolean;
  violations: string[];
}

export function defaultLimits(env: Record<string, string | undefined> = process.env): GuardrailLimits {
  const int = (v: string | undefined, fallback: number) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    maxActionsPerCycle: int(env.AGENT_MAX_ACTIONS_PER_CYCLE, 20),
    maxOpenDealsPerSupplier: int(env.AGENT_MAX_OPEN_DEALS_PER_SUPPLIER, 3),
    minTrustScore: int(env.AGENT_MIN_TRUST_SCORE, 50),
    minRealDiscountPct: int(env.AGENT_MIN_REAL_DISCOUNT_PCT, 10),
  };
}

export function checkOpenDeal(check: OpenDealCheck, limits: GuardrailLimits): GuardrailVerdict {
  const violations: string[] = [];

  if (check.killSwitchOn) violations.push("KILL_SWITCH_ON");
  if (check.actionsUsedThisCycle >= limits.maxActionsPerCycle) violations.push("ACTION_CAP_REACHED");

  if (!check.supplierVerified) violations.push("SUPPLIER_NOT_VERIFIED");
  if (check.supplierTrustScore < limits.minTrustScore) violations.push("SUPPLIER_TRUST_TOO_LOW");
  if (check.supplierOpenDeals >= limits.maxOpenDealsPerSupplier) violations.push("SUPPLIER_DEAL_CAP_REACHED");

  if (!check.fairnessOk) violations.push("FAIRNESS_CHECK_FAILED");
  if (!check.pricingOk) violations.push("PRICING_CHECK_FAILED");

  // Redundant on purpose: even if the pricing engine misbehaved, these
  // invariants are re-checked here with raw numbers.
  if (check.groupPrice < check.floorPrice) violations.push("PRICE_BELOW_FLOOR");
  if (check.discountPct < limits.minRealDiscountPct) violations.push("DISCOUNT_BELOW_MINIMUM");

  if (check.targetSize < 2) violations.push("GROUP_TOO_SMALL");
  if (check.availableCouponCodes < check.targetSize) violations.push("INSUFFICIENT_COUPON_POOL");
  if (check.stock < check.targetSize) violations.push("INSUFFICIENT_STOCK");

  return { allowed: violations.length === 0, violations };
}

export interface CloseDealCheck {
  killSwitchOn: boolean;
  memberCount: number;
  targetSize: number;
  availableCouponCodes: number;
}

export function checkCloseDeal(check: CloseDealCheck): GuardrailVerdict {
  const violations: string[] = [];
  if (check.killSwitchOn) violations.push("KILL_SWITCH_ON");
  if (check.memberCount < check.targetSize) violations.push("TARGET_NOT_REACHED");
  if (check.availableCouponCodes < check.memberCount) violations.push("INSUFFICIENT_COUPON_POOL");
  return { allowed: violations.length === 0, violations };
}

export interface TrendingOfferCheck {
  killSwitchOn: boolean;
  supplierVerified: boolean;
  supplierTrustScore: number;
  freeShipping: boolean;
  floorPrice: number;
  /** Verified lowest Israeli market price for the item (Zap). */
  marketPrice: number;
  /** Member price the pricing engine produced for this offer. */
  computedGroupPrice: number;
  pricingOk: boolean;
  stock: number;
  targetSize: number;
}

/**
 * A supplier offer on a trending item may only win when the member price it
 * yields strictly beats the verified lowest Israeli market price — with free
 * shipping mandatory, so the comparison needs no shipping adjustment.
 */
export function checkTrendingOffer(check: TrendingOfferCheck, limits: GuardrailLimits): GuardrailVerdict {
  const violations: string[] = [];

  if (check.killSwitchOn) violations.push("KILL_SWITCH_ON");
  if (!check.supplierVerified) violations.push("SUPPLIER_NOT_VERIFIED");
  if (check.supplierTrustScore < limits.minTrustScore) violations.push("SUPPLIER_TRUST_TOO_LOW");

  if (!check.freeShipping) violations.push("NO_FREE_SHIPPING");
  if (check.floorPrice >= check.marketPrice) violations.push("FLOOR_NOT_BELOW_MARKET");

  if (!check.pricingOk) violations.push("PRICING_CHECK_FAILED");
  // The whole point of a trending deal: members must pay strictly less than
  // the best price they could get alone anywhere in Israel.
  if (check.computedGroupPrice >= check.marketPrice) violations.push("PRICE_NOT_BELOW_MARKET");
  if (check.computedGroupPrice < check.floorPrice) violations.push("PRICE_BELOW_FLOOR");

  if (check.stock < check.targetSize) violations.push("INSUFFICIENT_STOCK");

  return { allowed: violations.length === 0, violations };
}
