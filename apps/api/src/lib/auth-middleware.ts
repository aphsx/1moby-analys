import { Elysia } from "elysia";
import { auth } from "../auth";

/** Minimal session-user shape we read (Better Auth returns additionalFields). */
interface SessionUser {
  id: string;
}

/**
 * Derives { userId } on every request by reading the Better Auth session.
 * `userId` is null for unauthenticated requests. Use `requireUser` to enforce.
 */
const userPlugin = new Elysia({ name: "user-plugin" }).derive(
  { as: "global" },
  async ({ request }) => {
    const sessionData = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    const sessionUser = (sessionData?.user ?? null) as SessionUser | null;
    return { userId: sessionUser?.id ?? null };
  }
);

/**
 * Elysia plugin that guards a route group: responds 401 if no session.
 * Uses `as: "scoped"` so the guard does NOT propagate to the parent app
 * (i.e. /health and other public routes are unaffected).
 *
 * Usage:
 *   const myRoutes = new Elysia().use(requireUser).get("/protected", ...)
 */
export const requireUser = new Elysia({ name: "require-user" })
  .use(userPlugin)
  .onBeforeHandle({ as: "scoped" }, ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { message: "Not authenticated" };
    }
  });
