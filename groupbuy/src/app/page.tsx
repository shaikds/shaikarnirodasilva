import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";

export default async function DealsPage() {
  const t = await getTranslations("deals");
  const format = await getFormatter();
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
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>

      {deals.length === 0 && (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          {t("empty")}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {deals.map((deal) => {
          const joined = deal._count.memberships;
          const pct = Math.min(100, Math.round((joined / deal.targetSize) * 100));
          return (
            <Link
              key={deal.id}
              href={`/deals/${deal.id}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{deal.product.name}</h2>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {t("verifiedDiscount", { pct: deal.discountPct })}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{deal.product.supplier.companyName}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-700">₪{Number(deal.groupPrice).toFixed(0)}</span>
                <span className="text-sm text-zinc-400 line-through">₪{Number(deal.referencePrice).toFixed(0)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>{t("joined", { count: joined, target: deal.targetSize })}</span>
                <span>{t("deadline", { date: format.dateTime(deal.deadline, { dateStyle: "medium" }) })}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
