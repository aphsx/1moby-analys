/** A positive number from the environment, or `fallback` when the variable is unset or invalid. */
export function positiveNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
