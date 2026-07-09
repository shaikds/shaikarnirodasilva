import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import DealCard from "@/components/DealCard";

export default async function DealsPage() {
  const t = await getTranslations("deals");
  const deals = await prisma.deal.findMany({
    where: { status: "OPEN" },
    include: {
      product: { include: { supplier: { select: { companyName: true } } } },
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="rise-in">
        <h1 className="text-4xl font-black tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("subtitle")}</p>
      </div>

      {deals.length === 0 && (
        <p className="mt-12 rounded-2xl border-2 border-dashed border-line p-12 text-center text-muted">{t("empty")}</p>
      )}

      <div className="stagger mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={{
              id: deal.id,
              productName: deal.product.name,
              supplierName: deal.product.supplier.companyName,
              category: deal.product.category,
              groupPrice: Number(deal.groupPrice),
              referencePrice: Number(deal.referencePrice),
              discountPct: deal.discountPct,
              fairnessScore: deal.fairnessScore,
              joined: deal._count.memberships,
              targetSize: deal.targetSize,
              deadline: deal.deadline,
            }}
          />
        ))}
      </div>
    </div>
  );
}
