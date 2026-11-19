import { addDays, isISODate, weekday } from "./dates";
import type { Priority, Recurrence } from "./types";

/**
 * Turns a free-text line such as "לשלם ארנונה מחר דחוף" into a task, without AI.
 * Only fixed Hebrew phrases are recognised; everything that is not recognised stays in the title.
 */
export interface QuickTask {
  title: string;
  due_date: string | null;
  priority: Priority | null;
  recurrence: Recurrence | null;
}

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const WD = WEEKDAYS.join("|");
// a phrase must stand alone: not glued to other Hebrew letters
const B = "(?<![\\u05D0-\\u05EAa-zA-Z0-9])";
const E = "(?![\\u05D0-\\u05EAa-zA-Z0-9])";
const UNTIL = "(?:עד\\s+|ל|ב-?\\s*)?";

/** Next date (after today) that falls on the given weekday. */
function nextWeekday(today: string, wd: number): string {
  const ahead = (wd - weekday(today) + 7) % 7 || 7;
  return addDays(today, ahead);
}

/** Next occurrence of day-of-month `d` (this month if still ahead, otherwise next month). */
function nextDayOfMonth(today: string, d: number): string | null {
  if (d < 1 || d > 31) return null;
  let [y, m] = today.split("-").map(Number);
  for (let i = 0; i < 13; i++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isISODate(iso) && iso >= today) return iso;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return null;
}

function explicitDate(today: string, d: number, mo: number, yRaw?: string): string | null {
  const ty = Number(today.slice(0, 4));
  let y = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : ty;
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (!isISODate(iso(y))) return null;
  if (!yRaw && iso(y) < today) y++; // "10/1" in December means next January
  return isISODate(iso(y)) ? iso(y) : null;
}

type Rule = { re: RegExp; apply: (m: RegExpMatchArray, out: QuickTask, today: string) => boolean };

const RULES: Rule[] = [
  // ---- recurrence (before plain weekdays, so "כל יום חמישי" is not read as "יום חמישי") ----
  {
    re: new RegExp(`${B}כל\\s+(?:יום\\s+)?(${WD})${E}`),
    apply: (m, o, today) => {
      o.recurrence = "weekly";
      o.due_date ??= nextWeekday(today, WEEKDAYS.indexOf(m[1]));
      return true;
    },
  },
  { re: new RegExp(`${B}כל\\s+(?:יום|בוקר|ערב)${E}`), apply: (_m, o) => ((o.recurrence = "daily"), true) },
  { re: new RegExp(`${B}כל\\s+שבוע${E}`), apply: (_m, o) => ((o.recurrence = "weekly"), true) },
  { re: new RegExp(`${B}כל\\s+חודש${E}`), apply: (_m, o) => ((o.recurrence = "monthly"), true) },
  { re: new RegExp(`${B}כל\\s+שנה${E}`), apply: (_m, o) => ((o.recurrence = "yearly"), true) },

  // ---- priority ("לא דחוף" before "דחוף") ----
  { re: new RegExp(`${B}לא\\s+דחוף${E}`), apply: (_m, o) => ((o.priority = "low"), true) },
  { re: new RegExp(`${B}(?:דחוף|בדחיפות|דחופה)${E}`), apply: (_m, o) => ((o.priority = "urgent"), true) },
  { re: new RegExp(`${B}(?:חשוב(?:\\s+מאוד)?|חשובה)${E}`), apply: (_m, o) => ((o.priority = "high"), true) },
  { re: new RegExp(`${B}עדיפות\\s+(נמוכה|בינונית|גבוהה)${E}`), apply: (m, o) => ((o.priority = ({ נמוכה: "low", בינונית: "medium", גבוהה: "high" } as const)[m[1] as "נמוכה"]), true) },

  // ---- dates (only the first date phrase is used) ----
  { re: new RegExp(`${B}${UNTIL}היום${E}`), apply: (_m, o, t) => (o.due_date ? false : ((o.due_date = t), true)) },
  { re: new RegExp(`${B}${UNTIL}מחרתיים${E}`), apply: (_m, o, t) => (o.due_date ? false : ((o.due_date = addDays(t, 2)), true)) },
  { re: new RegExp(`${B}${UNTIL}מחר${E}`), apply: (_m, o, t) => (o.due_date ? false : ((o.due_date = addDays(t, 1)), true)) },
  {
    re: new RegExp(`${B}בעוד\\s+(\\d{1,3}|יום|יומיים|שבוע|שבועיים|חודש)(?:\\s+(ימים|שבועות|חודשים))?${E}`),
    apply: (m, o, t) => {
      if (o.due_date) return false;
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : null;
      const days =
        n !== null
          ? m[2] === "שבועות"
            ? n * 7
            : m[2] === "חודשים"
              ? n * 30
              : n
          : ({ יום: 1, יומיים: 2, שבוע: 7, שבועיים: 14, חודש: 30 } as Record<string, number>)[m[1]];
      o.due_date = addDays(t, days);
      return true;
    },
  },
  {
    re: new RegExp(`${B}(?:ב|ל)?שבוע\\s+הבא${E}`),
    apply: (_m, o, t) => (o.due_date ? false : ((o.due_date = addDays(t, 7)), true)),
  },
  {
    // ביום חמישי / יום חמישי / בחמישי / עד יום חמישי
    re: new RegExp(`${B}(?:עד\\s+)?(?:ב?יום\\s+|ב)(${WD})${E}`),
    apply: (m, o, t) => (o.due_date ? false : ((o.due_date = nextWeekday(t, WEEKDAYS.indexOf(m[1]))), true)),
  },
  {
    // 10/12, 10.12, 10/12/27
    re: new RegExp(`${B}${UNTIL}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2}|\\d{4}))?${E}`),
    apply: (m, o, t) => {
      if (o.due_date) return false;
      const d = explicitDate(t, Number(m[1]), Number(m[2]), m[3]);
      if (!d) return false;
      o.due_date = d;
      return true;
    },
  },
  {
    // עד ה-10 / עד 10 / ב-10 / ל-10 / ה-10 לחודש (a bare number is not a date: "3 תפוחים")
    re: new RegExp(`${B}(?:עד\\s+(?:ה-?)?|ב-|ל-|בה-?|ה-?)(\\d{1,2})(?:\\s+לחודש)?${E}`),
    apply: (m, o, t) => {
      if (o.due_date) return false;
      const d = nextDayOfMonth(t, Number(m[1]));
      if (!d) return false;
      o.due_date = d;
      return true;
    },
  },
];

export function parseQuickTask(text: string, today: string): QuickTask {
  const out: QuickTask = { title: "", due_date: null, priority: null, recurrence: null };
  let rest = ` ${text} `;
  for (const rule of RULES) {
    const m = rest.match(rule.re);
    if (m && rule.apply(m, out, today)) rest = rest.replace(m[0], " ");
  }
  if (out.recurrence && !out.due_date) out.due_date = today; // a repeating task needs a date
  out.title = rest
    .replace(/\s+/g, " ")
    .replace(/^[\s,.\-–:;]+|[\s,.\-–:;]+$/g, "")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  if (!out.title) out.title = text.trim(); // never lose what the user typed
  return out;
}
