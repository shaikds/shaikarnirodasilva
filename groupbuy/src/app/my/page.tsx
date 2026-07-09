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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <h2 className="mt-6 font-semibold text-zinc-700">{t("activeGroups")}</h2>
        {memberships.length === 0 && <p className="mt-2 text-sm text-zinc-500">{t("noGroups")}</p>}
        <div className="mt-3 space-y-2">
          {memberships.map((m) => (
            <Link
              key={m.id}
              href={`/deals/${m.dealId}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm hover:shadow"
            >
              <span className="font-medium">{m.deal.product.name}</span>
              <span className="text-zinc-500">
                {m.deal._count.memberships}/{m.deal.targetSize} · {t("status")}: {m.deal.status}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-zinc-700">{t("coupons")}</h2>
        {coupons.length === 0 && <p className="mt-2 text-sm text-zinc-500">{t("noCoupons")}</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {coupons.map((c) => (
            <div key={c.id} className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-4">
              <div className="text-xs text-emerald-700">{c.product.name}</div>
              <div className="mt-1 font-mono text-xl font-bold text-emerald-800">{c.code}</div>
              <a
                className="mt-1 inline-block text-xs text-emerald-700 underline"
                href={c.product.supplier.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.product.supplier.companyName}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
