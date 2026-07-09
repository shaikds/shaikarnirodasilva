import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import Counter from "@/components/Counter";
import DealCard from "@/components/DealCard";

export default async function LandingPage() {
  const t = await getTranslations("landing");

  const [openDeals, totalDeals, memberCount, blockedCount, avgDiscount] = await Promise.all([
    prisma.deal.findMany({
      where: { status: "OPEN" },
      include: {
        product: { include: { supplier: { select: { companyName: true } } } },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.deal.count(),
    prisma.groupMembership.count(),
    prisma.agentDecision.count({ where: { outcome: "BLOCKED_BY_GUARDRAIL" } }),
    prisma.deal.aggregate({ _avg: { discountPct: true }, where: { status: { in: ["OPEN", "CLOSED"] } } }),
  ]);

  const stats = [
    { value: totalDeals, suffix: "", label: t("statDeals") },
    { value: memberCount, suffix: "", label: t("statMembers") },
    { value: Math.round(avgDiscount._avg.discountPct ?? 0), suffix: "%", label: t("statAvgDiscount") },
    { value: blockedCount, suffix: "", label: t("statBlocked") },
  ];

  const how = [
    { emoji: "🗳️", title: t("how1Title"), text: t("how1Text") },
    { emoji: "🤖", title: t("how2Title"), text: t("how2Text") },
    { emoji: "🎟️", title: t("how3Title"), text: t("how3Text") },
  ];

  const trust = [t("trust1"), t("trust2"), t("trust3"), t("trust4")];

  return (
    <div className="space-y-24 pb-8">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-950 px-6 py-16 text-white shadow-2xl sm:px-12 sm:py-24">
        <div className="pointer-events-none absolute -end-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-80 w-80 rounded-full bg-pop/20 blur-3xl" />
        <div className="float-slow pointer-events-none absolute end-10 top-10 hidden text-7xl opacity-40 sm:block">🛒</div>
        <div className="float-slow pointer-events-none absolute bottom-10 end-32 hidden text-5xl opacity-30 sm:block" style={{ animationDelay: "1.5s" }}>
          🎟️
        </div>

        <div className="relative max-w-2xl rise-in">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur">
            <span className="pulse-soft">●</span> {t("heroBadge")}
          </span>
          <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight sm:text-6xl">
            {t("heroTitle1")}
            <br />
            <span className="bg-gradient-to-r from-amber-200 to-pop bg-clip-text text-transparent">{t("heroTitle2")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-emerald-50/90">{t("heroText")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/deals"
              className="rounded-full bg-white px-6 py-3 font-bold text-brand-strong shadow-lg transition hover:scale-105 hover:shadow-xl"
            >
              {t("ctaDeals")}
            </Link>
            <a
              href="#how"
              className="rounded-full border-2 border-white/40 px-6 py-3 font-bold text-white transition hover:border-white hover:bg-white/10"
            >
              {t("ctaHow")}
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section className="stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
            <div className="text-4xl font-black text-brand">
              <Counter to={s.value} suffix={s.suffix} />
            </div>
            <div className="mt-1 text-sm font-medium text-muted">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-24">
        <h2 className="text-center text-3xl font-black tracking-tight">{t("howTitle")}</h2>
        <div className="stagger mt-10 grid gap-6 sm:grid-cols-3">
          {how.map((step, i) => (
            <div key={step.title} className="card-lift relative rounded-2xl border border-line bg-surface p-8 shadow-sm">
              <span className="absolute -top-4 start-6 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-pop to-pop-strong text-sm font-black text-white shadow-md">
                {i + 1}
              </span>
              <div className="text-5xl">{step.emoji}</div>
              <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Live deals ---------- */}
      {openDeals.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black tracking-tight">{t("liveTitle")}</h2>
            <Link href="/deals" className="font-semibold text-brand hover:underline">
              {t("liveAll")}
            </Link>
          </div>
          <div className="stagger mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {openDeals.map((deal) => (
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
        </section>
      )}

      {/* ---------- Trust / auditable AI ---------- */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="p-8 sm:p-12">
            <h2 className="text-3xl font-black tracking-tight">{t("trustTitle")}</h2>
            <p className="mt-4 leading-relaxed text-muted">{t("trustText")}</p>
            <ul className="mt-6 space-y-3">
              {trust.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-black text-brand-strong">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative hidden items-center justify-center bg-gradient-to-br from-brand-soft to-pop-soft sm:flex">
            <div className="float-slow text-9xl">🛡️</div>
          </div>
        </div>
      </section>
    </div>
  );
}
