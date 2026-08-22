export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function daysMaskToLabels(mask: number): string {
  if ((mask & 127) === 127) return "Every day";
  const on = DAY_LABELS.filter((_, i) => mask & (1 << i));
  return on.length ? on.join(", ") : "No days";
}

export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function formatTs(sec: number): string {
  try {
    return new Date(sec * 1000).toLocaleString();
  } catch {
    return String(sec);
  }
}

export function decisionLabel(decision: string): { text: string; cls: string } {
  if (decision === "called") return { text: "Called", cls: "ok" };
  if (decision === "call_failed") return { text: "Call failed", cls: "warn" };
  if (decision.startsWith("ignored:")) {
    const reason = decision.slice("ignored:".length);
    return { text: `Skipped (${reason})`, cls: "" };
  }
  return { text: decision, cls: "" };
}
