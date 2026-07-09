"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/security/rbac";
import { runAgentCycle } from "@/lib/agent/cycle";
import { checkRateLimit } from "@/lib/security/rateLimit";

export async function triggerAgentCycle() {
  const user = await requireUser("ADMIN");
  if (!checkRateLimit(`agent:${user.id}`, 6, 60_000)) return { error: "rate_limited" };
  const summary = await runAgentCycle(`admin:${user.id}`);
  revalidatePath("/admin");
  revalidatePath("/deals");
  return { ok: true, summary };
}

export async function setKillSwitch(on: boolean) {
  const user = await requireUser("ADMIN");
  await prisma.systemSetting.upsert({
    where: { key: "agent_kill_switch" },
    update: { value: on ? "on" : "off" },
    create: { key: "agent_kill_switch", value: on ? "on" : "off" },
  });
  await prisma.agentRun.create({
    data: {
      triggeredBy: `admin:${user.id}`,
      llmProvider: "-",
      finishedAt: new Date(),
      summary: JSON.stringify({ killSwitch: on ? "on" : "off" }),
    },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function setSupplierVerified(supplierId: string, verified: boolean) {
  await requireUser("ADMIN");
  const id = z.string().cuid().parse(supplierId);
  await prisma.supplier.update({ where: { id }, data: { verified } });
  revalidatePath("/admin");
  return { ok: true };
}
