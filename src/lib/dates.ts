import { TIME_ZONE } from "./constants";

/** All dates are ISO strings: YYYY-MM-DD, calculated in Israel time. */

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayISO(now: Date = new Date()): string {
  return partsFmt.format(now); // en-CA => YYYY-MM-DD
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toUTC(s);
  return !Number.isNaN(d.getTime()) && fromUTC(d) === s;
}

export function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86400000);
}

/** Day of week, 0 = Sunday */
export function weekday(iso: string): number {
  return toUTC(iso).getUTCDay();
}

/** Start of the week (Sunday) containing the given date */
export function weekStart(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(monthIso: string, n: number): string {
  const [y, m] = monthIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUTC(d).slice(0, 7) + "-01";
}

/** 6 weeks grid (42 days) starting on Sunday that covers the month of `monthIso` */
export function monthGrid(monthIso: string): string[] {
  const first = monthIso.slice(0, 7) + "-01";
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const monthNames = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
const monthShort = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
export const weekdayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const weekdayShort = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function monthTitle(monthIso: string): string {
  const [y, m] = monthIso.split("-").map(Number);
  return `${monthNames[m - 1]} ${y}`;
}

/** "12 באוק׳" (adds year if different from the current year) */
export function formatShort(iso: string, today = todayISO()): string {
  const [y, m, d] = iso.split("-").map(Number);
  const yr = Number(today.slice(0, 4));
  return `${d} ב${monthShort[m - 1]}${y !== yr ? ` ${y}` : ""}`;
}

export function formatLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `יום ${weekdayNames[weekday(iso)]}, ${d} ב${monthNames[m - 1]} ${y}`;
}

/** Relative label for due dates: היום / מחר / אתמול / לפני 3 ימים / 12 באוק׳ */
export function relativeLabel(iso: string, today = todayISO()): string {
  const diff = diffDays(iso, today);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  if (diff < 0 && diff >= -6) return `לפני ${-diff} ימים`;
  if (diff > 1 && diff <= 6) return `יום ${weekdayNames[weekday(iso)]}`;
  return formatShort(iso, today);
}

export function isOverdue(due: string | null, status: string, today = todayISO()): boolean {
  return !!due && status !== "done" && due < today;
}

/** ISO timestamp -> Israel-local YYYY-MM-DD */
export function isoToLocalDate(ts: string): string {
  return todayISO(new Date(ts));
}

/** Next occurrence of a recurring task: one step after the due date, never earlier than `today`. */
export function nextOccurrence(due: string, rec: "daily" | "weekly" | "monthly" | "yearly", today = todayISO()): string {
  const [y, m, d] = due.split("-").map(Number);
  const step = (n: number): string => {
    if (rec === "daily") return addDays(due, n);
    if (rec === "weekly") return addDays(due, 7 * n);
    const monthsToAdd = rec === "monthly" ? n : 12 * n;
    const total = m - 1 + monthsToAdd;
    const ty = y + Math.floor(total / 12);
    const tm = ((total % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return fromUTC(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
  };
  let n = 1;
  let next = step(n);
  while (next < today && n < 1000) next = step(++n);
  return next;
}
