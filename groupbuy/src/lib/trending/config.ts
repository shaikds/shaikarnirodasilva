export interface TrendingConfig {
  topN: number; // items kept per weekly scrape, and shown on the landing page
  claimWindowHours: number; // competitive-offer window once the first offer lands
  unclaimedExpiryDays: number; // voted items expire after this long without a claim
  zeroVoteExpiryDays: number; // items nobody voted for expire faster
}

export function trendingConfig(env: Record<string, string | undefined> = process.env): TrendingConfig {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    topN: num(env.TRENDING_TOP_N, 5),
    claimWindowHours: num(env.TRENDING_CLAIM_WINDOW_HOURS, 72),
    unclaimedExpiryDays: num(env.TRENDING_UNCLAIMED_EXPIRY_DAYS, 14),
    zeroVoteExpiryDays: num(env.TRENDING_ZERO_VOTE_EXPIRY_DAYS, 7),
  };
}
