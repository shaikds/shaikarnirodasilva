"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/security/rbac";
import { checkRateLimit } from "@/lib/security/rateLimit";

const idSchema = z.string().cuid();

export async function joinDeal(dealId: string) {
  const user = await requireUser(); // any signed-in role may join
  const id = idSchema.parse(dealId);
  if (!checkRateLimit(`join:${user.id}`, 20, 60_000)) return { error: "rate_limited" };

  const deal = await prisma.deal.findUnique({ where: { id }, include: { _count: { select: { memberships: true } } } });
  if (!deal || deal.status !== "OPEN") return { error: "deal_not_open" };
  if (deal.deadline < new Date()) return { error: "deal_expired" };

  await prisma.groupMembership.upsert({
    where: { dealId_userId: { dealId: id, userId: user.id } },
    update: {},
    create: { dealId: id, userId: user.id },
  });
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  return { ok: true };
}

export async function leaveDeal(dealId: string) {
  const user = await requireUser();
  const id = idSchema.parse(dealId);
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal || deal.status !== "OPEN") return { error: "deal_not_open" };
  await prisma.groupMembership.deleteMany({ where: { dealId: id, userId: user.id } });
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  return { ok: true };
}

export async function voteDemand(productId: string) {
  const user = await requireUser();
  const id = idSchema.parse(productId);
  if (!checkRateLimit(`vote:${user.id}`, 30, 60_000)) return { error: "rate_limited" };
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product?.active) return { error: "product_not_found" };
  await prisma.demandSignal.upsert({
    where: { userId_productId: { userId: user.id, productId: id } },
    update: {},
    create: { userId: user.id, productId: id },
  });
  revalidatePath("/products");
  return { ok: true };
}

export async function unvoteDemand(productId: string) {
  const user = await requireUser();
  const id = idSchema.parse(productId);
  await prisma.demandSignal.deleteMany({ where: { userId: user.id, productId: id } });
  revalidatePath("/products");
  return { ok: true };
}
