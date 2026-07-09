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
    "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";
  const label = "block text-xs font-medium text-zinc-600";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{supplier.companyName}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <span
            className={`rounded-full px-3 py-1 font-medium ${supplier.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
          >
            {supplier.verified ? t("verified") : t("unverified")}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
            {t("trust")}: {supplier.trustScore}/100
          </span>
        </div>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t("priceNote")}</p>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold">{t("addProduct")}</h2>
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
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              {t("save")}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-semibold">{t("products")}</h2>
        <div className="mt-3 space-y-4">
          {supplier.products.map((p) => (
            <div key={p.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="ms-2 text-xs text-zinc-500">({p.category})</span>
                </div>
                <div className="text-sm text-zinc-600">
                  ₪{Number(p.listPrice).toFixed(0)} · {t("stock")}: {p.stock} ·{" "}
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
                <button className="shrink-0 rounded-md border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
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
