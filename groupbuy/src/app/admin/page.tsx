import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { setKillSwitch, setSupplierVerified, triggerAgentCycle } from "@/app/actions/admin";

export default async function AdminPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const t = await getTranslations("admin");
  const format = await getFormatter();

  const [killSetting, runs, decisions, suppliers] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "agent_kill_switch" } }),
    prisma.agentRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.agentDecision.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { run: { select: { startedAt: true } } },
    }),
    prisma.supplier.findMany({ include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const killOn = killSetting?.value === "on";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <form
          action={async () => {
            "use server";
            await triggerAgentCycle();
          }}
        >
          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            disabled={killOn}
          >
            ▶ {t("runCycle")}
          </button>
        </form>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${killOn ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}
        >
          {killOn ? t("killOn") : t("killOff")}
        </span>
        <form
          action={async () => {
            "use server";
            await setKillSwitch(!killOn);
          }}
        >
          <button
            className={`rounded-md px-4 py-2 text-sm font-semibold ${killOn ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"}`}
          >
            {killOn ? t("disable") : t("enable")}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{t("runs")}</h2>
        <div className="mt-3 space-y-1 text-sm">
          {runs.map((r) => (
            <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-1.5">
              <span className="text-zinc-500">
                {format.dateTime(r.startedAt, { dateStyle: "short", timeStyle: "medium" })} · {r.triggeredBy} ·{" "}
                {r.llmProvider}
              </span>
              <span className="font-mono text-xs text-zinc-600">{r.summary}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{t("decisions")}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-start text-xs uppercase text-zinc-500">
                <th className="py-2 text-start">{t("action")}</th>
                <th className="py-2 text-start">{t("outcome")}</th>
                <th className="py-2 text-start">{t("reasons")}</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id} className="border-b border-zinc-100">
                  <td className="py-1.5 font-mono text-xs">{d.action}</td>
                  <td className="py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        d.outcome === "ALLOWED"
                          ? "bg-emerald-100 text-emerald-800"
                          : d.outcome === "BLOCKED_BY_GUARDRAIL"
                            ? "bg-red-100 text-red-800"
                            : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {d.outcome}
                    </span>
                  </td>
                  <td className="py-1.5 font-mono text-xs text-zinc-600">{d.reasons.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{t("suppliers")}</h2>
        <div className="mt-3 space-y-2 text-sm">
          {suppliers.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-2">
              <div>
                <span className="font-medium">{s.companyName}</span>
                <span className="ms-2 text-xs text-zinc-500">{s.user.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${s.trustScore < 50 ? "text-red-600" : "text-zinc-600"}`}>
                  {t("suppliers")} trust: {s.trustScore}/100
                </span>
                <form
                  action={async () => {
                    "use server";
                    await setSupplierVerified(s.id, !s.verified);
                  }}
                >
                  <button
                    className={`rounded-md border px-3 py-1 text-xs font-medium ${
                      s.verified
                        ? "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                        : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {s.verified ? t("unverify") : t("verify")}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
