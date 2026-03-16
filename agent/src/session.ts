/** Default session reset hour (4am, like OpenClaw). */
export const DEFAULT_RESET_HOUR = 4;

/**
 * Returns today's session date, accounting for the reset hour.
 * Before the reset hour, we're still in "yesterday's" session.
 * E.g., at 3am on March 17 with resetHour=4, returns "2026-03-16".
 */
export function sessionDate(resetHour: number = DEFAULT_RESET_HOUR): string {
  const now = new Date();
  if (now.getHours() < resetHour) {
    now.setDate(now.getDate() - 1);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
