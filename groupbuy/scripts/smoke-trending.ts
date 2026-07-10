/**
 * Dev smoke test for the trending lifecycle:
 * scrape (mock) -> votes reach threshold -> agent activates -> two competing
 * offers (one unfair) -> window ends -> agent resolves to the cheapest fair
 * offer -> product + demand signals created -> coupons uploaded -> next cycle
 * opens the deal at a price that beats the verified market price.
 */
import { runAgentCycle } from "@/lib/agent/cycle";
import { ingestTrending } from "@/lib/scraper/ingest";
import { prisma } from "@/lib/db";

async function main() {
  // 1. Scrape with the mock provider.
  const ingest = await ingestTrending();
  console.log("ingest:", ingest);
  if (ingest.upserted === 0) throw new Error("scraper upserted nothing");

  const item = await prisma.trendingItem.findFirst({
    where: { status: "LISTED", zapLowestPriceIls: { not: null } },
    orderBy: { scrapedAt: "desc" },
  });
  if (!item) throw new Error("no LISTED trending item with a Zap price");
  const market = Number(item.zapLowestPriceIls);
  console.log(`item: "${item.title}" market ₪${market}`);

  // 2. Compute threshold via one agent cycle, then vote exactly to it.
  await runAgentCycle("cli:smoke-trending");
  const withThreshold = await prisma.trendingItem.findUniqueOrThrow({ where: { id: item.id } });
  if (withThreshold.votesNeeded == null) throw new Error("agent did not compute votesNeeded");
  console.log("votesNeeded:", withThreshold.votesNeeded);

  const members = await prisma.user.findMany({ where: { role: "MEMBER" }, take: withThreshold.votesNeeded });
  if (members.length < withThreshold.votesNeeded) throw new Error("not enough demo members to reach threshold");
  for (const m of members) {
    await prisma.trendingVote.upsert({
      where: { userId_trendingItemId: { userId: m.id, trendingItemId: item.id } },
      update: {},
      create: { userId: m.id, trendingItemId: item.id },
    });
  }

  // 3. Agent activates the item.
  const s1 = await runAgentCycle("cli:smoke-trending");
  console.log("activated this cycle:", s1.trendingActivated);
  const claimable = await prisma.trendingItem.findUniqueOrThrow({ where: { id: item.id } });
  if (claimable.status !== "CLAIMABLE") throw new Error(`expected CLAIMABLE, got ${claimable.status}`);

  // 4. Two competing offers: an unfair one (floor above market) from the shady
  //    supplier and a fair one from the honest supplier.
  const suppliers = await prisma.supplier.findMany({ where: { verified: true }, orderBy: { trustScore: "desc" }, take: 2 });
  if (suppliers.length < 2) throw new Error("need two verified demo suppliers");
  const [honest, other] = suppliers;
  await prisma.supplierOffer.create({
    data: { trendingItemId: item.id, supplierId: other.id, floorPrice: market * 1.2, stock: 100, freeShipping: true },
  });
  await prisma.supplierOffer.create({
    data: { trendingItemId: item.id, supplierId: honest.id, floorPrice: Math.round(market * 0.65), stock: 100, freeShipping: true },
  });
  // Window already over (simulate 72h passing).
  await prisma.trendingItem.update({
    where: { id: item.id },
    data: { status: "CLAIM_WINDOW", claimWindowEndsAt: new Date(Date.now() - 1000) },
  });

  // 5. Agent resolves the claim.
  const s2 = await runAgentCycle("cli:smoke-trending");
  console.log("converted this cycle:", s2.trendingConverted, "blocked:", s2.blocked);
  const converted = await prisma.trendingItem.findUniqueOrThrow({ where: { id: item.id } });
  if (converted.status !== "CONVERTED" || !converted.productId) throw new Error(`expected CONVERTED, got ${converted.status}`);

  const winningOffer = await prisma.supplierOffer.findFirstOrThrow({ where: { trendingItemId: item.id, status: "WON" } });
  if (winningOffer.supplierId !== honest.id) throw new Error("agent picked the wrong (unfair/pricier) offer");
  const product = await prisma.product.findUniqueOrThrow({ where: { id: converted.productId } });
  const signals = await prisma.demandSignal.count({ where: { productId: product.id } });
  console.log(`product created: "${product.name}", demand signals: ${signals}`);
  if (signals < members.length) throw new Error("votes were not converted to demand signals");

  // 6. Winner uploads coupons -> next cycle opens the deal.
  await prisma.couponCode.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({ productId: product.id, code: `TREND-${Date.now()}-${i}` })),
    skipDuplicates: true,
  });
  const s3 = await runAgentCycle("cli:smoke-trending");
  console.log("opened this cycle:", s3.opened);
  const deal = await prisma.deal.findFirst({ where: { productId: product.id, status: "OPEN" } });
  if (!deal) throw new Error("no deal opened for the converted trending product");
  const dealPrice = Number(deal.groupPrice);
  console.log(`deal open: ₪${dealPrice} vs market ₪${market} (${deal.discountPct}% off)`);
  if (!(dealPrice < market)) throw new Error("deal price does not beat the verified market price");
  if (dealPrice < Number(winningOffer.floorPrice)) throw new Error("deal price below the winning floor");

  console.log("SMOKE TRENDING OK");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
