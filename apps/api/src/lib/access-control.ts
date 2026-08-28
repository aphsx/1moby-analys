/**
 * Org-shared access model.
 *
 * Every authenticated user can read and mutate every run/source/output.
 * Guards only check that the record exists (404). Login is the only gate.
 */

export function denyNotFound(
  set: { status?: number | string },
  message = "Not found"
) {
  set.status = 404;
  return { message };
}

type DenyBody = { message: string };

/**
 * Returns a 404 deny body only when the record is missing.
 * Usage: `const denied = requireFoundForRead(...); if (denied) return denied;`
 */
export function requireFoundForRead(
  record: unknown,
  set: { status?: number | string },
  notFoundMessage = "Not found"
): DenyBody | null {
  if (!record) return denyNotFound(set, notFoundMessage);
  return null;
}
