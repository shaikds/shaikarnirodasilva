import { describe, expect, it } from "vitest";
import { checkOpenDeal, defaultLimits, type OpenDealCheck } from "@/lib/agent/guardrails";
import { printScorecard, type CaseResult } from "./scorecard";

const limits = defaultLimits({
  AGENT_MAX_ACTIONS_PER_CYCLE: "20",
  AGENT_MAX_OPEN_DEALS_PER_SUPPLIER: "3",
  AGENT_MIN_TRUST_SCORE: "50",
  AGENT_MIN_REAL_DISCOUNT_PCT: "10",
});

const clean: OpenDealCheck = {
  killSwitchOn: false,
  actionsUsedThisCycle: 0,
  supplierVerified: true,
  supplierTrustScore: 80,
  supplierOpenDeals: 0,
  fairnessOk: true,
  fairnessScore: 90,
  pricingOk: true,
  groupPrice: 350,
  floorPrice: 280,
  discountPct: 22,
  targetSize: 5,
  availableCouponCodes: 30,
  stock: 100,
};

/** Adversarial scenarios: each one attacks a single control; all must block. */
const attacks: { name: string; patch: Partial<OpenDealCheck> }[] = [
  { name: "kill switch flipped mid-cycle", patch: { killSwitchOn: true } },
  { name: "runaway agent exhausts action cap", patch: { actionsUsedThisCycle: 999 } },
  { name: "unverified supplier sneaks a product in", patch: { supplierVerified: false } },
  { name: "repeat-offender supplier (trust 10)", patch: { supplierTrustScore: 10 } },
  { name: "supplier floods platform with deals", patch: { supplierOpenDeals: 50 } },
  { name: "fairness engine said no", patch: { fairnessOk: false } },
  { name: "pricing engine said no", patch: { pricingOk: false } },
  { name: "price sneaks below supplier floor", patch: { groupPrice: 279.99 } },
  { name: "token 1% 'discount' deal", patch: { discountPct: 1 } },
  { name: "1-person 'group'", patch: { targetSize: 1 } },
  { name: "coupon pool cannot cover group", patch: { targetSize: 50, availableCouponCodes: 3 } },
  { name: "stock cannot cover group", patch: { targetSize: 50, availableCouponCodes: 60, stock: 5 } },
];

describe("guardrail compliance", () => {
  it("blocks every adversarial scenario and allows the clean one", () => {
    const results: CaseResult[] = [];
    results.push({ name: "clean deal is allowed", pass: checkOpenDeal(clean, limits).allowed });
    for (const attack of attacks) {
      const verdict = checkOpenDeal({ ...clean, ...attack.patch }, limits);
      results.push({
        name: attack.name,
        pass: !verdict.allowed,
        note: verdict.allowed ? "WAS ALLOWED" : verdict.violations.join(","),
      });
    }
    const rate = printScorecard("guardrail-compliance", results);
    expect(rate).toBe(1);
  });
});
