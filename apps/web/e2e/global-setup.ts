import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTestAuth } from "./test-auth";

const E2E_ADMIN_EMAIL = "e2e-admin@moby.test";
// biome-ignore lint/correctness/noGlobalDirnameFilename: import.meta.dirname breaks under Playwright's CJS transform here — __dirname is required.
const STATE_PATH = join(__dirname, ".auth", "state.json");

/** Better Auth's internal user type doesn't infer the `role` additionalField. */
type UserWithRole = { id: string; role?: string };

/** Minimal .env loader: only fills vars not already set (no dotenv dependency). */
function loadRootEnv() {
  // biome-ignore lint/correctness/noGlobalDirnameFilename: import.meta.dirname breaks under Playwright's CJS transform here — __dirname is required.
  const envPath = join(__dirname, "..", "..", "..", ".env");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    process.env[key] ??= value;
  }
}

export default async function globalSetup() {
  loadRootEnv();
  const testAuth = buildTestAuth();
  const ctx = await testAuth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(E2E_ADMIN_EMAIL);
  const user = (existing?.user ??
    (await ctx.test.saveUser(
      ctx.test.createUser({
        email: E2E_ADMIN_EMAIL,
        name: "E2E Admin",
        role: "admin",
      })
    ))) as UserWithRole;

  if (user.role !== "admin") {
    await ctx.internalAdapter.updateUser(user.id, { role: "admin" });
  }

  const { cookies } = await ctx.test.login({ userId: user.id });
  const cookiesWithExpiry = cookies.map((cookie) => ({
    ...cookie,
    expires: cookie.expires ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }));

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ cookies: cookiesWithExpiry, origins: [] }, null, 2)
  );
}
