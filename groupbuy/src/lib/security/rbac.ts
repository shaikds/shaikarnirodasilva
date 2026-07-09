import { auth } from "@/lib/auth";
import type { Role } from "@prisma/client";

export class AuthzError extends Error {
  constructor(readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * Single chokepoint for authorization in server actions and route handlers.
 * Always call this (not auth() directly) so role checks stay consistent.
 */
export async function requireUser(...roles: Role[]) {
  const session = await auth();
  if (!session?.user?.id) throw new AuthzError(401, "Not signed in");
  if (roles.length > 0 && !roles.includes(session.user.role)) {
    throw new AuthzError(403, "Insufficient role");
  }
  return session.user;
}
