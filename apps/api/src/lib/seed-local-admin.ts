/**
 * Upserts a local-only credential admin (admin@example.com / 123) so Docker /
 * `bun run dev` always has a usable admin without Google OAuth.
 * Login form accepts shorthand "admin" → admin@example.com.
 *
 * Enabled when SEED_LOCAL_ADMIN=true, or when unset and NODE_ENV !== "production".
 * Set SEED_LOCAL_ADMIN=false to skip.
 */
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { USER_ROLE } from "@moby/types";
import { db } from "../db/client";
import { account, user } from "../db/schema";

export const LOCAL_ADMIN = {
  id: "local-admin",
  email: "admin@example.com",
  name: "Admin",
  password: "123",
  role: USER_ROLE.ADMIN,
} as const;

function seedEnabled(): boolean {
  const flag = process.env.SEED_LOCAL_ADMIN?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") return true;
  return process.env.NODE_ENV !== "production";
}

export async function seedLocalAdmin(): Promise<void> {
  if (!seedEnabled()) return;

  const passwordHash = await hashPassword(LOCAL_ADMIN.password);
  const now = new Date();

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, LOCAL_ADMIN.email))
    .limit(1);

  const userId = existing[0]?.id ?? LOCAL_ADMIN.id;

  if (existing.length === 0) {
    await db.insert(user).values({
      id: LOCAL_ADMIN.id,
      name: LOCAL_ADMIN.name,
      email: LOCAL_ADMIN.email,
      emailVerified: true,
      role: LOCAL_ADMIN.role,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(user)
      .set({
        role: LOCAL_ADMIN.role,
        name: LOCAL_ADMIN.name,
        emailVerified: true,
        updatedAt: now,
      })
      .where(eq(user.id, userId));
  }

  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);

  if (!credential) {
    await db.insert(account).values({
      id: `${LOCAL_ADMIN.id}-credential`,
      userId,
      accountId: LOCAL_ADMIN.email,
      providerId: "credential",
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: now })
      .where(eq(account.id, credential.id));
  }

  console.log(
    `[api] Local admin ready: ${LOCAL_ADMIN.email} / ${LOCAL_ADMIN.password} (role=${LOCAL_ADMIN.role})`
  );
}
