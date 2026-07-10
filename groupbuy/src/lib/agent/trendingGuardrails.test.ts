import { describe, expect, it } from "vitest";
import { checkTrendingOffer, defaultLimits, type TrendingOfferCheck } from "./guardrails";

const limits = defaultLimits({
  AGENT_MAX_ACTIONS_PER_CYCLE: "20",
  AGENT_MAX_OPEN_DEALS_PER_SUPPLIER: "3",
  AGENT_MIN_TRUST_SCORE: "50",
  AGENT_MIN_REAL_DISCOUNT_PCT: "10",
});

const okOffer: TrendingOfferCheck = {
  killSwitchOn: false,
  supplierVerified: true,
  supplierTrustScore: 80,
  freeShipping: true,
  floorPrice: 280,
  marketPrice: 400,
  computedGroupPrice: 340,
  pricingOk: true,
  stock: 50,
  targetSize: 10,
};

describe("checkTrendingOffer", () => {
  it("allows a clean offer", () => {
    expect(checkTrendingOffer(okOffer, limits)).toEqual({ allowed: true, violations: [] });
  });

  it("blocks when free shipping is not committed", () => {
    const v = checkTrendingOffer({ ...okOffer, freeShipping: false }, limits);
    expect(v.allowed).toBe(false);
    expect(v.violations).toContain("NO_FREE_SHIPPING");
  });

  it("blocks a floor at or above the verified market price", () => {
    const v = checkTrendingOffer({ ...okOffer, floorPrice: 400 }, limits);
    expect(v.violations).toContain("FLOOR_NOT_BELOW_MARKET");
  });

  it("blocks a member price that does not beat the market", () => {
    const v = checkTrendingOffer({ ...okOffer, computedGroupPrice: 400 }, limits);
    expect(v.violations).toContain("PRICE_NOT_BELOW_MARKET");
  });

  it("blocks a member price below the supplier floor (win-win broken the other way)", () => {
    const v = checkTrendingOffer({ ...okOffer, computedGroupPrice: 250 }, limits);
    expect(v.violations).toContain("PRICE_BELOW_FLOOR");
  });

  it("blocks the kill switch", () => {
    const v = checkTrendingOffer({ ...okOffer, killSwitchOn: true }, limits);
    expect(v.violations).toContain("KILL_SWITCH_ON");
  });

  it("blocks unverified or low-trust suppliers", () => {
    expect(checkTrendingOffer({ ...okOffer, supplierVerified: false }, limits).violations).toContain(
      "SUPPLIER_NOT_VERIFIED",
    );
    expect(checkTrendingOffer({ ...okOffer, supplierTrustScore: 20 }, limits).violations).toContain(
      "SUPPLIER_TRUST_TOO_LOW",
    );
  });

  it("blocks insufficient stock", () => {
    const v = checkTrendingOffer({ ...okOffer, stock: 3 }, limits);
    expect(v.violations).toContain("INSUFFICIENT_STOCK");
  });

  it("blocks failed pricing", () => {
    const v = checkTrendingOffer({ ...okOffer, pricingOk: false }, limits);
    expect(v.violations).toContain("PRICING_CHECK_FAILED");
  });
});
