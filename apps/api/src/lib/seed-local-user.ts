/**
 * Upserts a local-only credential user (admin@example.com / 123) so Docker /
 * `bun run dev` always has a usable login without Google OAuth.
 * Login form accepts shorthand "admin" → admin@example.com.
 *
 * Enabled when SEED_LOCAL_USER is true, or when unset and NODE_ENV !== "production".
 * Set SEED_LOCAL_USER=false to skip.
 */
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../db/client";
import { account, user } from "../db/schema";

export const LOCAL_USER = {
  id: "local-user",
  email: "admin@example.com",
  name: "Local",
  password: "123",
} as const;

function seedEnabled(): boolean {
  const flag = process.env.SEED_LOCAL_USER?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") return true;
  return process.env.NODE_ENV !== "production";
}

export async function seedLocalUser(): Promise<void> {
  if (!seedEnabled()) return;

  const passwordHash = await hashPassword(LOCAL_USER.password);
  const now = new Date();

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, LOCAL_USER.email))
    .limit(1);

  const userId = existing[0]?.id ?? LOCAL_USER.id;

  if (existing.length === 0) {
    await db.insert(user).values({
      id: LOCAL_USER.id,
      name: LOCAL_USER.name,
      email: LOCAL_USER.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(user)
      .set({
        name: LOCAL_USER.name,
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
      id: `${LOCAL_USER.id}-credential`,
      userId,
      accountId: LOCAL_USER.email,
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

  console.log(`[api] Local login ready: ${LOCAL_USER.email} / ${LOCAL_USER.password}`);
}
