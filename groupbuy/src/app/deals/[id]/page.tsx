import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { joinDeal, leaveDeal } from "@/app/actions/member";
import Countdown from "@/components/Countdown";

const CATEGORY_EMOJI: Record<string, string> = {
  headphones: "🎧",
  kitchen: "🍳",
  fitness: "⌚",
  "smart-home": "🏠",
};

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("deals");
  const session = await auth();

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      product: { include: { supplier: { select: { companyName: true, websiteUrl: true, trustScore: true } } } },
      _count: { select: { memberships: true } },
    },
  });
  if (!deal) notFound();

  const membership = session
    ? await prisma.groupMembership.findUnique({
        where: { dealId_userId: { dealId: deal.id, userId: session.user.id } },
      })
    : null;
  const myCoupon =
    session && deal.status === "CLOSED"
      ? await prisma.couponCode.findFirst({ where: { dealId: deal.id, assignedTo: session.user.id } })
      : null;

  const joined = deal._count.memberships;
  const pct = Math.min(100, Math.round((joined / deal.targetSize) * 100));
  const almostFull = pct >= 70;

  return (
    <div className="mx-auto max-w-3xl rise-in">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lg">
        {/* hero strip */}
        <div className="relative flex h-44 items-center justify-center bg-gradient-to-br from-brand-soft via-surface to-pop-soft">
          <span className="text-8xl">{CATEGORY_EMOJI[deal.product.category] ?? "🛍️"}</span>
          <span className="absolute end-5 top-5 rounded-full bg-gradient-to-r from-pop to-pop-strong px-4 py-1.5 text-lg font-black text-white shadow-lg">
            -{deal.discountPct}%
          </span>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight">{deal.product.name}</h1>
              <p className="mt-1 text-sm text-muted">{deal.product.supplier.companyName}</p>
            </div>
            <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-strong">
              ✓ {t("fairness", { score: deal.fairnessScore })}
            </span>
          </div>

          <p className="mt-4 leading-relaxed text-muted">{deal.product.description}</p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-strong p-5 text-white shadow-md">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{t("groupPrice")}</div>
              <div className="mt-1 text-4xl font-black">₪{Number(deal.groupPrice).toFixed(0)}</div>
            </div>
            <div className="rounded-2xl border border-line p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t("reference")}</div>
              <div className="mt-1 text-4xl font-black text-muted line-through">
                ₪{Number(deal.referencePrice).toFixed(0)}
              </div>
            </div>
          </div>

          {deal.aiRationale && (
            <div className="mt-6 rounded-2xl border border-brand-soft bg-brand-soft/40 p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-strong">
                <span className="text-base">🤖</span> {t("aiRationale")}
              </div>
              <p className="mt-2 text-sm leading-relaxed">{deal.aiRationale}</p>
            </div>
          )}

          <div className="mt-8">
            <div className="h-3.5 overflow-hidden rounded-full bg-line">
              <div
                className={`bar-animate h-full rounded-full ${almostFull ? "bg-gradient-to-r from-pop to-pop-strong" : "bg-gradient-to-r from-brand to-brand-strong"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className={`font-bold ${almostFull ? "text-pop-strong" : "text-muted"}`}>
                {almostFull && "🔥 "}
                {t("joined", { count: joined, target: deal.targetSize })}
              </span>
              <Countdown deadline={deal.deadline.toISOString()} doneLabel={t("closed")} />
            </div>
          </div>

          <div className="mt-8">
            {deal.status === "CLOSED" ? (
              myCoupon ? (
                <div className="rounded-2xl border-2 border-dashed border-brand bg-brand-soft/40 p-6 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-brand-strong">{t("yourCoupon")}</div>
                  <div className="mt-2 font-mono text-3xl font-black tracking-widest text-brand-strong">
                    {myCoupon.code}
                  </div>
                  <a
                    className="mt-3 inline-block rounded-full bg-brand px-5 py-2 text-sm font-bold text-white shadow-md transition hover:brightness-110"
                    href={deal.product.supplier.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("redeemAt")} ↗
                  </a>
                </div>
              ) : (
                <p className="text-center font-bold text-muted">{t("closed")}</p>
              )
            ) : !session ? (
              <Link
                href="/login"
                className="block w-full rounded-2xl bg-gradient-to-r from-brand to-brand-strong py-4 text-center text-lg font-black text-white shadow-lg transition hover:shadow-xl hover:brightness-110"
              >
                {t("signInToJoin")}
              </Link>
            ) : membership ? (
              <form
                action={async () => {
                  "use server";
                  await leaveDeal(deal.id);
                }}
              >
                <button className="w-full rounded-2xl border-2 border-line py-4 text-lg font-bold text-muted transition hover:border-danger hover:text-danger">
                  {t("leave")}
                </button>
              </form>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await joinDeal(deal.id);
                }}
              >
                <button className="w-full rounded-2xl bg-gradient-to-r from-brand to-brand-strong py-4 text-lg font-black text-white shadow-lg transition hover:scale-[1.01] hover:shadow-xl hover:brightness-110">
                  🎉 {t("join")}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
