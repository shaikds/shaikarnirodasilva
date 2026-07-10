"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/security/rbac";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { ingestTrending } from "@/lib/scraper/ingest";

const idSchema = z.string().cuid();

export async function voteTrending(trendingItemId: string) {
  const user = await requireUser(); // any signed-in role may vote
  const id = idSchema.parse(trendingItemId);
  if (!checkRateLimit(`tvote:${user.id}`, 30, 60_000)) return { error: "rate_limited" };

  const item = await prisma.trendingItem.findUnique({ where: { id } });
  if (!item || (item.status !== "LISTED" && item.status !== "CLAIMABLE")) return { error: "not_votable" };

  await prisma.trendingVote.upsert({
    where: { userId_trendingItemId: { userId: user.id, trendingItemId: id } },
    update: {},
    create: { userId: user.id, trendingItemId: id },
  });
  revalidatePath("/");
  return { ok: true };
}

export async function unvoteTrending(trendingItemId: string) {
  const user = await requireUser();
  const id = idSchema.parse(trendingItemId);
  await prisma.trendingVote.deleteMany({ where: { userId: user.id, trendingItemId: id } });
  revalidatePath("/");
  return { ok: true };
}

export async function triggerScrape() {
  await requireUser("ADMIN");
  const summary = await ingestTrending();
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, summary };
}
