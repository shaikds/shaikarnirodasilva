import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export default async function MyPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const t = await getTranslations("my");

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: session.user.id },
    include: {
      deal: { include: { product: true, _count: { select: { memberships: true } } } },
    },
    orderBy: { joinedAt: "desc" },
  });
  const coupons = await prisma.couponCode.findMany({
    where: { assignedTo: session.user.id },
    include: { product: { include: { supplier: { select: { websiteUrl: true, companyName: true } } } } },
    orderBy: { assignedAt: "desc" },
  });

  const statusTone: Record<string, string> = {
    OPEN: "bg-brand-soft text-brand-strong",
    CLOSED: "bg-pop-soft text-pop-strong",
    EXPIRED: "bg-line text-muted",
  };

  return (
    <div className="space-y-12">
      <div className="rise-in">
        <h1 className="text-4xl font-black tracking-tight">{t("title")}</h1>

        <h2 className="mt-8 text-lg font-bold">{t("activeGroups")}</h2>
        {memberships.length === 0 && <p className="mt-2 text-sm text-muted">{t("noGroups")}</p>}
        <div className="stagger mt-4 space-y-3">
          {memberships.map((m) => {
            const pct = Math.min(100, Math.round((m.deal._count.memberships / m.deal.targetSize) * 100));
            return (
              <Link
                key={m.id}
                href={`/deals/${m.dealId}`}
                className="card-lift flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:shadow-lg"
              >
                <div className="grow">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{m.deal.product.name}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusTone[m.deal.status] ?? "bg-line text-muted"}`}
                    >
                      {m.deal.status}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="bar-animate h-full rounded-full bg-gradient-to-r from-brand to-brand-strong"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {m.deal._count.memberships}/{m.deal.targetSize}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold">{t("coupons")}</h2>
        {coupons.length === 0 && <p className="mt-2 text-sm text-muted">{t("noCoupons")}</p>}
        <div className="stagger mt-4 grid gap-4 sm:grid-cols-2">
          {coupons.map((c) => (
            <div
              key={c.id}
              className="card-lift rounded-2xl border-2 border-dashed border-brand bg-brand-soft/40 p-5 text-center"
            >
              <div className="text-xs font-bold text-brand-strong">🎟️ {c.product.name}</div>
              <div className="mt-2 font-mono text-2xl font-black tracking-widest text-brand-strong">{c.code}</div>
              <a
                className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
                href={c.product.supplier.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.product.supplier.companyName} ↗
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
