import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createProduct, uploadCoupons } from "@/app/actions/supplier";

export default async function SupplierPage() {
  const session = await auth();
  if (!session || (session.user.role !== "SUPPLIER" && session.user.role !== "ADMIN")) redirect("/login");
  const t = await getTranslations("supplier");

  const supplier = await prisma.supplier.findUnique({
    where: { userId: session.user.id },
    include: {
      products: {
        include: { _count: { select: { demandSignals: true, couponCodes: { where: { assignedTo: null } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!supplier) redirect("/");

  const input =
    "mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
  const label = "block text-xs font-bold text-muted";

  return (
    <div className="space-y-8">
      <div className="rise-in flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-black tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-muted">{supplier.companyName}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span
            className={`rounded-full px-3 py-1.5 font-bold ${supplier.verified ? "bg-brand-soft text-brand-strong" : "bg-pop-soft text-pop-strong"}`}
          >
            {supplier.verified ? `✓ ${t("verified")}` : `⏳ ${t("unverified")}`}
          </span>
          <span className="rounded-full bg-line px-3 py-1.5 font-bold">
            {t("trust")}: {supplier.trustScore}/100
          </span>
        </div>
      </div>

      <p className="rounded-2xl border border-pop-soft bg-pop-soft/50 p-4 text-sm font-medium text-pop-strong">
        ⚠️ {t("priceNote")}
      </p>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">➕ {t("addProduct")}</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await createProduct(formData);
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label className={label}>{t("name")}</label>
            <input name="name" required minLength={2} maxLength={120} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>{t("description")}</label>
            <textarea name="description" maxLength={2000} rows={2} className={input} />
          </div>
          <div>
            <label className={label}>{t("category")}</label>
            <input name="category" required minLength={2} maxLength={60} className={input} placeholder="headphones" />
          </div>
          <div>
            <label className={label}>{t("stock")}</label>
            <input name="stock" type="number" min={0} required className={input} />
          </div>
          <div>
            <label className={label}>{t("listPrice")}</label>
            <input name="listPrice" type="number" step="0.01" min={1} required className={input} />
          </div>
          <div>
            <label className={label}>{t("floorPrice")}</label>
            <input name="floorPrice" type="number" step="0.01" min={1} required className={input} />
          </div>
          <div>
            <label className={label}>{t("maxDiscount")}</label>
            <input name="maxDiscountPct" type="number" min={0} max={95} defaultValue={40} required className={input} />
          </div>
          <div className="flex items-end">
            <button className="rounded-full bg-gradient-to-r from-brand to-brand-strong px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-110">
              {t("save")}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-bold">{t("products")}</h2>
        <div className="stagger mt-4 space-y-4">
          {supplier.products.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold">{p.name}</span>
                  <span className="ms-2 rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-muted">
                    {p.category}
                  </span>
                </div>
                <div className="text-sm font-medium text-muted">
                  ₪{Number(p.listPrice).toFixed(0)} · {t("stock")}: {p.stock} · 🎟️{" "}
                  {t("unassigned", { count: p._count.couponCodes })}
                </div>
              </div>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await uploadCoupons(p.id, String(formData.get("codes") ?? ""));
                }}
                className="mt-3 flex gap-2"
              >
                <input name="codes" placeholder={t("couponsHelp")} className={input + " mt-0 grow"} />
                <button className="shrink-0 rounded-full border-2 border-brand px-4 py-2 text-sm font-bold text-brand transition hover:bg-brand-soft">
                  {t("upload")}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
