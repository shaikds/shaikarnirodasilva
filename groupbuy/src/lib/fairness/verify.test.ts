import { describe, expect, it } from "vitest";
import { verifyFairness } from "./verify";

const DAY = 86_400_000;
const now = new Date("2026-07-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

describe("verifyFairness", () => {
  it("passes an honest supplier priced at market", () => {
    const r = verifyFairness({
      claimedListPrice: 440,
      floorPrice: 280,
      marketReferencePrice: 450,
      priceHistory: [
        { listPrice: 450, recordedAt: daysAgo(80) },
        { listPrice: 440, recordedAt: daysAgo(30) },
      ],
      now,
    });
    expect(r.fair).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.referencePrice).toBe(440);
  });

  it("blocks an inflated list price vs market", () => {
    const r = verifyFairness({
      claimedListPrice: 480, // market is 250 => 92% inflated
      floorPrice: 210,
      marketReferencePrice: 250,
      priceHistory: [{ listPrice: 480, recordedAt: daysAgo(10) }],
      now,
    });
    expect(r.fair).toBe(false);
    expect(r.flags).toContain("LIST_PRICE_INFLATED_VS_MARKET");
    // Discounts would be measured against the market price, not the fake 480.
    expect(r.referencePrice).toBe(250);
  });

  it("detects the inflate-before-discount price hike pattern", () => {
    const r = verifyFairness({
      claimedListPrice: 480,
      floorPrice: 210,
      marketReferencePrice: null, // even without market data
      priceHistory: [
        { listPrice: 260, recordedAt: daysAgo(45) },
        { listPrice: 480, recordedAt: daysAgo(3) },
      ],
      now,
    });
    expect(r.flags).toContain("RECENT_PRICE_HIKE");
    // Reference falls back to the 90-day minimum: the honest 260.
    expect(r.referencePrice).toBe(260);
    expect(r.fair).toBe(false);
  });

  it("uses the 90-day minimum as reference so old hikes still cannot fake discounts", () => {
    const r = verifyFairness({
      claimedListPrice: 400,
      floorPrice: 100,
      marketReferencePrice: null,
      priceHistory: [
        { listPrice: 200, recordedAt: daysAgo(85) },
        { listPrice: 400, recordedAt: daysAgo(70) }, // hike outside the 30d hike window
      ],
      now,
    });
    expect(r.referencePrice).toBe(200);
  });

  it("flags a floor price above fair market value", () => {
    const r = verifyFairness({
      claimedListPrice: 300,
      floorPrice: 290,
      marketReferencePrice: 250,
      priceHistory: [],
      now,
    });
    expect(r.flags).toContain("FLOOR_ABOVE_MARKET");
    expect(r.fair).toBe(false);
  });

  it("is cautious but not blocking when no market reference exists", () => {
    const r = verifyFairness({
      claimedListPrice: 300,
      floorPrice: 200,
      marketReferencePrice: null,
      priceHistory: [{ listPrice: 300, recordedAt: daysAgo(60) }],
      now,
    });
    expect(r.fair).toBe(true);
    expect(r.flags).toContain("NO_MARKET_REFERENCE");
    expect(r.score).toBeLessThan(100);
  });

  it("rejects garbage input", () => {
    const r = verifyFairness({
      claimedListPrice: -1,
      floorPrice: 10,
      marketReferencePrice: null,
      priceHistory: [],
      now,
    });
    expect(r.fair).toBe(false);
    expect(r.flags).toContain("INVALID_PRICES");
  });
});
