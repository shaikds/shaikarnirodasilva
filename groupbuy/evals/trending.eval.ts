import { describe, expect, it } from "vitest";
import { checkTrendingOffer, defaultLimits, type TrendingOfferCheck } from "@/lib/agent/guardrails";
import { computeGroupPrice } from "@/lib/pricing/engine";
import { computeActivationThreshold } from "@/lib/trending/threshold";
import { printScorecard, type CaseResult } from "./scorecard";

/**
 * Trending pipeline evals:
 *  1. Offer resolution safety — bad offers (no free shipping, floor above
 *     market, price that doesn't beat the market) must be blocked; the best
 *     valid offer must be the one members pay least for.
 *  2. Threshold sanity — items where a win-win is impossible must never
 *     activate; every activated threshold must actually produce a member
 *     price strictly below the verified market price.
 */

const limits = defaultLimits({
  AGENT_MAX_ACTIONS_PER_CYCLE: "20",
  AGENT_MAX_OPEN_DEALS_PER_SUPPLIER: "3",
  AGENT_MIN_TRUST_SCORE: "50",
  AGENT_MIN_REAL_DISCOUNT_PCT: "10",
});

const MARKET = 400; // verified Zap lowest price
const PPP = 0.85;

function priceOffer(floorPrice: number, groupSize: number) {
  return computeGroupPrice({
    floorPrice,
    referencePrice: MARKET,
    groupSize,
    pppFactor: PPP,
    maxDiscountPct: 90,
    minRealDiscountPct: limits.minRealDiscountPct,
  });
}

function checkOffer(patch: Partial<TrendingOfferCheck>): ReturnType<typeof checkTrendingOffer> {
  const pricing = priceOffer(280, 10);
  const base: TrendingOfferCheck = {
    killSwitchOn: false,
    supplierVerified: true,
    supplierTrustScore: 80,
    freeShipping: true,
    floorPrice: 280,
    marketPrice: MARKET,
    computedGroupPrice: pricing.groupPrice,
    pricingOk: pricing.ok,
    stock: 50,
    targetSize: 10,
  };
  return checkTrendingOffer({ ...base, ...patch }, limits);
}

describe("trending offer resolution", () => {
  it("blocks every unfair offer and rewards the cheapest valid one", () => {
    const results: CaseResult[] = [];

    results.push({ name: "clean competitive offer is allowed", pass: checkOffer({}).allowed });
    results.push({
      name: "no free-shipping commitment must block",
      pass: checkOffer({ freeShipping: false }).violations.includes("NO_FREE_SHIPPING"),
    });
    results.push({
      name: "floor above verified market must block (fake-discount attempt)",
      pass: checkOffer({ floorPrice: 450 }).violations.includes("FLOOR_NOT_BELOW_MARKET"),
    });
    results.push({
      name: "member price >= market must block (no real saving)",
      pass: checkOffer({ computedGroupPrice: MARKET }).violations.includes("PRICE_NOT_BELOW_MARKET"),
    });
    results.push({
      name: "unverified supplier cannot win a trending claim",
      pass: !checkOffer({ supplierVerified: false }).allowed,
    });

    // Competitive selection: the engine price for the lower floor must be
    // <= the engine price for the higher floor, so the lower-floor supplier
    // wins and members pay less.
    const cheap = priceOffer(240, 10);
    const pricey = priceOffer(360, 10);
    results.push({
      name: "lower-floor offer yields members the lower price (agent picks it)",
      pass: cheap.ok && cheap.groupPrice <= (pricey.ok ? pricey.groupPrice : Infinity),
    });

    // Every offer that survives guardrails implies member price beats market.
    const survivors = [priceOffer(240, 10), priceOffer(300, 25), priceOffer(150, 4)].filter((p) => p.ok);
    results.push({
      name: "every guardrail-surviving price strictly beats the verified market price",
      pass: survivors.every((p) => p.groupPrice < MARKET),
    });

    const rate = printScorecard("trending offer resolution", results);
    expect(rate).toBe(1);
  });
});

describe("trending activation threshold", () => {
  it("never activates impossible items and always activates real win-wins", () => {
    const results: CaseResult[] = [];

    const impossible = computeActivationThreshold({
      zapLowestPriceIls: MARKET,
      floorPrice: MARKET, // floor equals market: no room for any saving
      pppFactor: PPP,
      maxDiscountPct: 90,
      minRealDiscountPct: limits.minRealDiscountPct,
    });
    results.push({ name: "floor == market can never activate", pass: impossible === null });

    const healthy = computeActivationThreshold({
      zapLowestPriceIls: MARKET,
      floorPrice: 280,
      pppFactor: PPP,
      maxDiscountPct: 90,
      minRealDiscountPct: limits.minRealDiscountPct,
    });
    results.push({ name: "healthy item gets a finite threshold", pass: healthy !== null && healthy >= 2 });

    if (healthy !== null) {
      const atThreshold = priceOffer(280, healthy);
      results.push({
        name: "price at the activation threshold beats the market with a real discount",
        pass:
          atThreshold.ok &&
          atThreshold.groupPrice < MARKET &&
          atThreshold.discountPct >= limits.minRealDiscountPct &&
          atThreshold.groupPrice >= 280,
      });
    }

    // Sweep: for many (market, floor) combos, an activated threshold must
    // always be backed by a genuinely winning price.
    let sweepOk = true;
    for (const market of [100, 250, 400, 900, 2500]) {
      for (const floorFrac of [0.4, 0.6, 0.75, 0.9, 1.0, 1.1]) {
        const n = computeActivationThreshold({
          zapLowestPriceIls: market,
          floorPrice: Math.round(market * floorFrac * 100) / 100,
          pppFactor: PPP,
          maxDiscountPct: 90,
          minRealDiscountPct: limits.minRealDiscountPct,
        });
        if (n === null) continue;
        const p = computeGroupPrice({
          floorPrice: Math.round(market * floorFrac * 100) / 100,
          referencePrice: market,
          groupSize: n,
          pppFactor: PPP,
          maxDiscountPct: 90,
          minRealDiscountPct: limits.minRealDiscountPct,
        });
        if (!(p.ok && p.groupPrice < market)) sweepOk = false;
      }
    }
    results.push({ name: "30-combo sweep: every activation is a real win-win", pass: sweepOk });

    const rate = printScorecard("trending activation threshold", results);
    expect(rate).toBe(1);
  });
});
