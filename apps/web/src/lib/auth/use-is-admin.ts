"use client";
/** Org-role helper for the shared-access model (see @moby/types USER_ROLE).
 * Admin = import train data, trigger training, pin production models, delete
 * anything, outcome backfill.
 * Member = view everything, import predict data, create prediction runs, AI
 * chat, delete own model versions (when no prediction run still references them).
 *
 * Usage:
 *   const { isAdmin, userId, loading } = useIsAdmin();
 *   const canDelete = canMutateAsCreator(isAdmin, userId, run.created_by);
 */
import { USER_ROLE } from "@moby/types";
import { useSession } from "./client";

export interface RoleInfo {
  /** True when the signed-in user has the admin role. */
  isAdmin: boolean;
  /** Signed-in user id (null while loading / signed out). */
  userId: string | null;
  /** True while the session is still resolving — keep actions enabled-neutral. */
  loading: boolean;
}

export function useIsAdmin(): RoleInfo {
  const { data, isPending } = useSession();
  const user = data?.user ?? null;
  return {
    isAdmin: user?.role === USER_ROLE.ADMIN,
    userId: user?.id ?? null,
    loading: isPending,
  };
}

/** Creator-or-admin rule shared by run/source mutation buttons (mirrors the API). */
export function canMutateAsCreator(
  isAdmin: boolean,
  userId: string | null,
  createdBy: string | null | undefined
): boolean {
  if (isAdmin) return true;
  return Boolean(userId && createdBy && userId === createdBy);
}

/** Tooltip shown on disabled admin-only actions. */
export const ADMIN_ONLY_TITLE = "เฉพาะ admin เท่านั้น";

/** Tooltip shown on disabled creator-or-admin actions. */
export const CREATOR_OR_ADMIN_TITLE = "เฉพาะผู้สร้างหรือ admin เท่านั้น";
