/**
 * Relative + absolute timestamp formatting for community posts. Pure.
 */

/** "3m", "5h", "2d", or a short date for older posts. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Full, unambiguous timestamp for the title attribute. */
export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN");
}
