import { USER_PROFILE_FIELDS, USER_ROLE_FIELD } from "@moby/types";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import pg from "pg";

/**
 * Test-only Better Auth instance (mirrors apps/api/src/auth.ts's DB + secret)
 * with the testUtils plugin added so Playwright's global setup can mint a
 * signed session cookie without driving the Google OAuth flow.
 */
export function buildTestAuth() {
  const databaseUrl =
    process.env.PLAYWRIGHT_DATABASE_URL ??
    "postgresql://moby:moby1234@localhost:5433/moby";
  const pool = new pg.Pool({ connectionString: databaseUrl });

  return betterAuth({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    database: pool,
    plugins: [testUtils()],
    secret:
      process.env.BETTER_AUTH_SECRET ?? "change-me-to-a-random-32-byte-string",
    user: {
      additionalFields: { ...USER_PROFILE_FIELDS, ...USER_ROLE_FIELD },
    },
  });
}
