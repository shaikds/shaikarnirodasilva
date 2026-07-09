import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { unvoteDemand, voteDemand } from "@/app/actions/member";

const CATEGORY_EMOJI: Record<string, string> = {
  headphones: "🎧",
  kitchen: "🍳",
  fitness: "⌚",
  "smart-home": "🏠",
};

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
      <div className="rise-in">
        <h1 className="text-4xl font-black tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("subtitle")}</p>
      </div>

      <div className="stagger mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const voted = session && Array.isArray(product.demandSignals) && product.demandSignals.length > 0;
          const votes = product._count.demandSignals;
          return (
            <div
              key={product.id}
              className="card-lift flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm hover:shadow-xl"
            >
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-brand-soft via-surface to-pop-soft text-5xl">
                {CATEGORY_EMOJI[product.category] ?? "🛍️"}
              </div>
              <div className="flex grow flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold">{product.name}</h2>
                  <span className="shrink-0 text-xl font-black">₪{Number(product.listPrice).toFixed(0)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {t("by", { name: product.supplier.companyName })}
                  {product.supplier.verified && <span className="ms-1 font-bold text-brand">✓</span>}
                </p>
                <p className="mt-2 line-clamp-2 grow text-sm text-muted">{product.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="rounded-full bg-pop-soft px-2.5 py-1 text-xs font-bold text-pop-strong">
                    🔥 {t("votes", { count: votes })}
                  </span>
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
                            ? "rounded-full border-2 border-line px-4 py-1.5 text-sm font-bold text-muted transition hover:border-danger hover:text-danger"
                            : "rounded-full bg-gradient-to-r from-brand to-brand-strong px-4 py-1.5 text-sm font-bold text-white shadow-md transition hover:scale-105 hover:brightness-110"
                        }
                      >
                        {voted ? t("unwant") : `👍 ${t("want")}`}
                      </button>
                    </form>
                  ) : (
                    <Link href="/login" className="text-sm font-bold text-brand hover:underline">
                      {t("want")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
