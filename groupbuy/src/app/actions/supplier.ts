"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/security/rbac";

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  category: z.string().trim().min(2).max(60).toLowerCase(),
  listPrice: z.coerce.number().positive().max(1_000_000),
  floorPrice: z.coerce.number().positive().max(1_000_000),
  maxDiscountPct: z.coerce.number().int().min(0).max(95),
  stock: z.coerce.number().int().min(0).max(1_000_000),
});

async function requireSupplier() {
  const user = await requireUser("SUPPLIER", "ADMIN");
  const supplier = await prisma.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) throw new Error("No supplier profile");
  return { user, supplier };
}

export async function createProduct(formData: FormData) {
  const { supplier } = await requireSupplier();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  if (d.floorPrice > d.listPrice) return { error: "Floor price cannot exceed list price" };

  await prisma.product.create({
    data: {
      supplierId: supplier.id,
      name: d.name,
      description: d.description,
      category: d.category,
      listPrice: d.listPrice,
      floorPrice: d.floorPrice,
      maxDiscountPct: d.maxDiscountPct,
      stock: d.stock,
      priceHistory: { create: { listPrice: d.listPrice } },
    },
  });
  revalidatePath("/supplier");
  return { ok: true };
}

export async function updateListPrice(productId: string, newPrice: number) {
  const { supplier } = await requireSupplier();
  const id = z.string().cuid().parse(productId);
  const price = z.coerce.number().positive().max(1_000_000).parse(newPrice);

  // Object-level authorization: suppliers may only touch their own products.
  const product = await prisma.product.findFirst({ where: { id, supplierId: supplier.id } });
  if (!product) return { error: "not_found" };

  // Every price change is recorded — this history is what defeats
  // inflate-before-discount gaming.
  await prisma.$transaction([
    prisma.product.update({ where: { id }, data: { listPrice: price } }),
    prisma.priceHistory.create({ data: { productId: id, listPrice: price } }),
  ]);
  revalidatePath("/supplier");
  return { ok: true };
}

const couponUploadSchema = z
  .string()
  .max(50_000)
  .transform((raw) =>
    raw
      .split(/[\n,]+/)
      .map((c) => c.trim())
      .filter((c) => /^[A-Za-z0-9_-]{4,64}$/.test(c))
  );

export async function uploadCoupons(productId: string, rawCodes: string) {
  const { supplier } = await requireSupplier();
  const id = z.string().cuid().parse(productId);
  const product = await prisma.product.findFirst({ where: { id, supplierId: supplier.id } });
  if (!product) return { error: "not_found" };

  const codes = couponUploadSchema.parse(rawCodes);
  if (codes.length === 0) return { error: "No valid codes (4-64 chars, letters/digits/-/_)" };

  const result = await prisma.couponCode.createMany({
    data: codes.map((code) => ({ productId: id, code })),
    skipDuplicates: true,
  });
  revalidatePath("/supplier");
  return { ok: true, added: result.count };
}
