import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rateLimit";

const signupSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(100),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200)
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a digit"),
  asSupplier: z.boolean().optional(),
  companyName: z.string().trim().min(1).max(120).optional(),
  websiteUrl: z.string().url().max(300).startsWith("https://").optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`signup:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { email, name, password, asSupplier, companyName, websiteUrl } = parsed.data;
  if (asSupplier && (!companyName || !websiteUrl)) {
    return NextResponse.json({ error: "Suppliers must provide company name and https website" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: asSupplier ? "SUPPLIER" : "MEMBER",
        supplier: asSupplier
          ? {
              create: {
                companyName: companyName!,
                websiteUrl: websiteUrl!,
                verified: false, // admin verifies before the agent may open deals
              },
            }
          : undefined,
      },
    });
  } catch {
    // Uniform response whether the email exists or not (no account enumeration).
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}
