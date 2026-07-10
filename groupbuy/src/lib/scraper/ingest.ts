import { prisma } from "@/lib/db";
import { trendingConfig } from "@/lib/trending/config";
import { getScraperProvider } from "./index";
import type { DiscoverySource, ScrapedTrendingItem, ScraperProvider } from "./types";

/**
 * Weekly trending ingest:
 *  1. scrape each discovery source (isolated — one failing source never kills
 *     the run),
 *  2. price-check every item against Zap (the verified lowest Israeli price),
 *  3. keep the top-N per run by trend score,
 *  4. upsert by (source, externalId) so voted items keep their votes,
 *  5. expire stale items (14d unclaimed / 7d with zero votes).
 */

const DISCOVERY_SOURCES: DiscoverySource[] = ["KSP", "SUPER_PHARM"];

export interface IngestSummary {
  provider: string;
  scraped: number;
  upserted: number;
  expired: number;
  sourceErrors: string[];
}

/** Bestseller-list position + social proof. Rank is implicit in array order. */
export function trendScore(item: ScrapedTrendingItem, rankInList: number): number {
  const rankScore = Math.max(0, 100 - rankInList * 10);
  const social = (item.rating ?? 0) * Math.log10((item.reviewCount ?? 0) + 1) * 5;
  return rankScore + social;
}

export async function ingestTrending(provider: ScraperProvider = getScraperProvider()): Promise<IngestSummary> {
  const cfg = trendingConfig();
  const summary: IngestSummary = { provider: provider.name, scraped: 0, upserted: 0, expired: 0, sourceErrors: [] };

  const scored: Array<{ item: ScrapedTrendingItem; source: DiscoverySource; score: number }> = [];
  for (const source of DISCOVERY_SOURCES) {
    try {
      const items = await provider.fetchTrending(source);
      summary.scraped += items.length;
      items.forEach((item, rank) => scored.push({ item, source, score: trendScore(item, rank) }));
    } catch (err) {
      summary.sourceErrors.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.topN);

  for (const { item, source } of top) {
    let zapPrice: number | null = null;
    try {
      zapPrice = await provider.fetchZapLowestPrice(item.title);
    } catch {
      // unverified items simply keep zapLowestPriceIls null and cannot activate
    }
    await prisma.trendingItem.upsert({
      where: { source_externalId: { source, externalId: item.externalId } },
      update: {
        title: item.title,
        category: item.category,
        sourceUrl: item.sourceUrl,
        sourcePriceIls: item.priceIls,
        ...(zapPrice != null ? { zapLowestPriceIls: zapPrice } : {}),
        rating: item.rating,
        reviewCount: item.reviewCount,
        scrapedAt: new Date(),
      },
      create: {
        title: item.title,
        category: item.category,
        source,
        externalId: item.externalId,
        sourceUrl: item.sourceUrl,
        sourcePriceIls: item.priceIls,
        zapLowestPriceIls: zapPrice,
        rating: item.rating,
        reviewCount: item.reviewCount,
      },
    });
    summary.upserted += 1;
  }

  summary.expired = await expireStaleTrending(cfg.unclaimedExpiryDays, cfg.zeroVoteExpiryDays);
  return summary;
}

/** Expire LISTED/CLAIMABLE items past their lifecycle budget. Returns count. */
export async function expireStaleTrending(unclaimedExpiryDays: number, zeroVoteExpiryDays: number): Promise<number> {
  const now = Date.now();
  const unclaimedCutoff = new Date(now - unclaimedExpiryDays * 86_400_000);
  const zeroVoteCutoff = new Date(now - zeroVoteExpiryDays * 86_400_000);

  const { count: unclaimed } = await prisma.trendingItem.updateMany({
    where: { status: { in: ["LISTED", "CLAIMABLE"] }, createdAt: { lt: unclaimedCutoff } },
    data: { status: "EXPIRED" },
  });
  const { count: zeroVote } = await prisma.trendingItem.updateMany({
    where: { status: "LISTED", createdAt: { lt: zeroVoteCutoff }, votes: { none: {} } },
    data: { status: "EXPIRED" },
  });
  return unclaimed + zeroVote;
}
