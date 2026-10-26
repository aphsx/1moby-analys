import { Elysia } from "elysia";
import { auth } from "../../auth";
import { HttpError } from "./errors";

/** Minimal session-user shape we read (Better Auth returns additionalFields). */
interface SessionUser {
  id: string;
}

/**
 * Derives { userId } on every request by reading the Better Auth session.
 * `userId` is null for unauthenticated requests. Use `requireUser` to enforce.
 */
export const userPlugin = new Elysia({ name: "user-plugin" }).derive(
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
 * Elysia plugin that guards a route group: 401 without a session, and `userId` is
 * typed as a string inside the group. Uses `as: "scoped"` so the guard does NOT
 * propagate to the parent app (i.e. /health and other public routes are unaffected).
 *
 * Usage:
 *   const myRoutes = new Elysia().use(requireUser).get("/protected", ({ userId }) => ...)
 */
export const requireUser = new Elysia({ name: "require-user" })
  .use(userPlugin)
  .resolve({ as: "scoped" }, ({ userId }) => {
    if (!userId) throw new HttpError(401, "Not authenticated", "UNAUTHENTICATED");
    return { userId };
  });
