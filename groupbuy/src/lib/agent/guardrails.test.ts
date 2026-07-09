import { describe, expect, it } from "vitest";
import { checkCloseDeal, checkOpenDeal, defaultLimits, type OpenDealCheck } from "./guardrails";

const limits = defaultLimits({
  AGENT_MAX_ACTIONS_PER_CYCLE: "20",
  AGENT_MAX_OPEN_DEALS_PER_SUPPLIER: "3",
  AGENT_MIN_TRUST_SCORE: "50",
  AGENT_MIN_REAL_DISCOUNT_PCT: "10",
});

const okCheck: OpenDealCheck = {
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

describe("checkOpenDeal", () => {
  it("allows a clean deal", () => {
    expect(checkOpenDeal(okCheck, limits)).toEqual({ allowed: true, violations: [] });
  });

  it.each([
    [{ killSwitchOn: true }, "KILL_SWITCH_ON"],
    [{ actionsUsedThisCycle: 20 }, "ACTION_CAP_REACHED"],
    [{ supplierVerified: false }, "SUPPLIER_NOT_VERIFIED"],
    [{ supplierTrustScore: 30 }, "SUPPLIER_TRUST_TOO_LOW"],
    [{ supplierOpenDeals: 3 }, "SUPPLIER_DEAL_CAP_REACHED"],
    [{ fairnessOk: false }, "FAIRNESS_CHECK_FAILED"],
    [{ pricingOk: false }, "PRICING_CHECK_FAILED"],
    [{ groupPrice: 200 }, "PRICE_BELOW_FLOOR"],
    [{ discountPct: 5 }, "DISCOUNT_BELOW_MINIMUM"],
    [{ targetSize: 1 }, "GROUP_TOO_SMALL"],
    [{ availableCouponCodes: 2 }, "INSUFFICIENT_COUPON_POOL"],
    [{ stock: 3 }, "INSUFFICIENT_STOCK"],
  ] as const)("blocks on %o", (patch, code) => {
    const verdict = checkOpenDeal({ ...okCheck, ...patch }, limits);
    expect(verdict.allowed).toBe(false);
    expect(verdict.violations).toContain(code);
  });

  it("accumulates multiple violations", () => {
    const verdict = checkOpenDeal(
      { ...okCheck, killSwitchOn: true, supplierVerified: false, groupPrice: 100 },
      limits
    );
    expect(verdict.violations).toEqual(
      expect.arrayContaining(["KILL_SWITCH_ON", "SUPPLIER_NOT_VERIFIED", "PRICE_BELOW_FLOOR"])
    );
  });
});

describe("checkCloseDeal", () => {
  it("allows closing a full group with enough codes", () => {
    const v = checkCloseDeal({ killSwitchOn: false, memberCount: 5, targetSize: 5, availableCouponCodes: 10 });
    expect(v.allowed).toBe(true);
  });
  it("blocks when target not reached", () => {
    const v = checkCloseDeal({ killSwitchOn: false, memberCount: 3, targetSize: 5, availableCouponCodes: 10 });
    expect(v.violations).toContain("TARGET_NOT_REACHED");
  });
  it("blocks when coupon pool is short", () => {
    const v = checkCloseDeal({ killSwitchOn: false, memberCount: 5, targetSize: 5, availableCouponCodes: 4 });
    expect(v.violations).toContain("INSUFFICIENT_COUPON_POOL");
  });
  it("blocks when kill switch is on", () => {
    const v = checkCloseDeal({ killSwitchOn: true, memberCount: 5, targetSize: 5, availableCouponCodes: 10 });
    expect(v.violations).toContain("KILL_SWITCH_ON");
  });
});

describe("defaultLimits", () => {
  it("falls back on malformed env values", () => {
    const l = defaultLimits({ AGENT_MAX_ACTIONS_PER_CYCLE: "banana" });
    expect(l.maxActionsPerCycle).toBe(20);
  });
});
