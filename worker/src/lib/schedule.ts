import type { Schedule } from "../types";

/** Local day-of-week (0=Sun..6=Sat) and minutes-from-midnight for a timezone. */
export function localNow(tz: string, at: Date = new Date()): { dow: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    // Unknown timezone → fall back to UTC.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[get("weekday")] ?? 0;
  const minutes = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  return { dow, minutes };
}

/** Does a window (possibly wrapping past midnight) contain the given local time? */
function windowContains(s: Schedule, dow: number, minutes: number): boolean {
  const dayActive = (s.days_mask & (1 << dow)) !== 0;
  const prevDayActive = (s.days_mask & (1 << ((dow + 6) % 7))) !== 0;

  if (s.start_min <= s.end_min) {
    // Same-day window, e.g. 09:00–17:00.
    return dayActive && minutes >= s.start_min && minutes < s.end_min;
  }
  // Wraps midnight, e.g. 22:00–06:00. The morning tail belongs to the window that
  // started the previous day.
  if (dayActive && minutes >= s.start_min) return true; // evening portion, today
  if (prevDayActive && minutes < s.end_min) return true; // morning portion, from yesterday
  return false;
}

export interface ScheduleDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Decide whether a call is allowed right now given the user's schedules.
 * - Any matching 'quiet' window suppresses the call.
 * - If any 'active' windows exist, the call is allowed only inside one of them.
 */
export function scheduleAllows(
  schedules: Schedule[],
  tz: string,
  at: Date = new Date(),
): ScheduleDecision {
  const { dow, minutes } = localNow(tz, at);

  const quiet = schedules.filter((s) => s.kind === "quiet");
  for (const s of quiet) {
    if (windowContains(s, dow, minutes)) {
      return { allowed: false, reason: "quiet hours" };
    }
  }

  const active = schedules.filter((s) => s.kind === "active");
  if (active.length > 0) {
    const inAny = active.some((s) => windowContains(s, dow, minutes));
    if (!inAny) return { allowed: false, reason: "outside active hours" };
  }

  return { allowed: true, reason: "ok" };
}
