import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { unvoteDemand, voteDemand } from "@/app/actions/member";

export default async function ProductsPage() {
  const t = await getTranslations("products");
  const session = await auth();

  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      supplier: { select: { companyName: true, verified: true } },
      _count: { select: { demandSignals: true } },
      demandSignals: session ? { where: { userId: session.user.id }, select: { id: true } } : false,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {products.map((product) => {
          const voted = session && Array.isArray(product.demandSignals) && product.demandSignals.length > 0;
          return (
            <div key={product.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{product.name}</h2>
                <span className="shrink-0 text-lg font-bold text-zinc-700">₪{Number(product.listPrice).toFixed(0)}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {t("by", { name: product.supplier.companyName })}
                {product.supplier.verified && <span className="ms-1 text-emerald-600">✓</span>}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{product.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-zinc-500">{t("votes", { count: product._count.demandSignals })}</span>
                {session ? (
                  <form
                    action={async () => {
                      "use server";
                      if (voted) await unvoteDemand(product.id);
                      else await voteDemand(product.id);
                    }}
                  >
                    <button
                      className={
                        voted
                          ? "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                          : "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      }
                    >
                      {voted ? t("unwant") : t("want")}
                    </button>
                  </form>
                ) : (
                  <Link href="/login" className="text-sm text-emerald-700 underline">
                    {t("want")}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
