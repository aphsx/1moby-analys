/**
 * Shared auth contract — single source of truth for the authenticated user
 * shape and the extra profile fields populated from the Google OAuth profile.
 *
 * Consumed by:
 *  - apps/api  → Better Auth `user.additionalFields` (server)
 *  - apps/web  → `inferAdditionalFields` on the auth client (typing) + UI
 */

/** Field-attribute definitions for the columns we add on top of Better Auth's
 *  built-in user fields. `input: false` keeps them read-only from the client —
 *  they are only ever set by the Google profile mapping on sign-in. */
export const USER_PROFILE_FIELDS = {
  givenName: { type: "string", required: false, input: false },
  familyName: { type: "string", required: false, input: false },
  locale: { type: "string", required: false, input: false },
} as const;


