import { notFound } from "next/navigation";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { joinDeal, leaveDeal } from "@/app/actions/member";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("deals");
  const format = await getFormatter();
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{deal.product.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">{deal.product.supplier.companyName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
            {t("verifiedDiscount", { pct: deal.discountPct })}
          </span>
        </div>

        <p className="mt-4 text-sm text-zinc-600">{deal.product.description}</p>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">{t("groupPrice")}</div>
            <div className="text-lg font-bold text-emerald-700">₪{Number(deal.groupPrice).toFixed(0)}</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">{t("reference")}</div>
            <div className="text-lg font-semibold text-zinc-400 line-through">
              ₪{Number(deal.referencePrice).toFixed(0)}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">{t("fairness", { score: deal.fairnessScore })}</div>
            <div className="text-lg font-bold">{deal.fairnessScore}/100</div>
          </div>
        </div>

        {deal.aiRationale && (
          <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{t("aiRationale")}</div>
            <p className="mt-1 text-sm text-emerald-900">{deal.aiRationale}</p>
          </div>
        )}

        <div className="mt-6">
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>{t("joined", { count: joined, target: deal.targetSize })}</span>
            <span>{t("deadline", { date: format.dateTime(deal.deadline, { dateStyle: "medium" }) })}</span>
          </div>
        </div>

        <div className="mt-6">
          {deal.status === "CLOSED" ? (
            myCoupon ? (
              <div className="rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50 p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-emerald-700">{t("yourCoupon")}</div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-800">{myCoupon.code}</div>
                <a
                  className="mt-2 inline-block text-sm text-emerald-700 underline"
                  href={deal.product.supplier.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("redeemAt")}
                </a>
              </div>
            ) : (
              <p className="text-center text-sm font-semibold text-zinc-500">{t("closed")}</p>
            )
          ) : !session ? (
            <Link
              href="/login"
              className="block w-full rounded-lg bg-emerald-600 py-3 text-center font-semibold text-white hover:bg-emerald-700"
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
              <button className="w-full rounded-lg border border-zinc-300 py-3 font-semibold text-zinc-600 hover:bg-zinc-50">
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
              <button className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700">
                {t("join")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
