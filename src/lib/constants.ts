import type { Priority, Recurrence, Status, ViewType } from "./types";

export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: "daily", label: "כל יום" },
  { value: "weekly", label: "כל שבוע" },
  { value: "monthly", label: "כל חודש" },
  { value: "yearly", label: "כל שנה" },
];
export const RECURRENCE_VALUES = RECURRENCES.map((r) => r.value);

export const PRIORITIES: { value: Priority; label: string; color: string; rank: number }[] = [
  { value: "urgent", label: "דחוף", color: "#e5484d", rank: 4 },
  { value: "high", label: "גבוהה", color: "#ee8a3c", rank: 3 },
  { value: "medium", label: "בינונית", color: "#d9a521", rank: 2 },
  { value: "low", label: "נמוכה", color: "#5b86e5", rank: 1 },
];

export const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: "new", label: "חדשה", color: "#7c8cf0" },
  { value: "in_progress", label: "בעבודה", color: "#b67be0" },
  { value: "on_hold", label: "בהשהייה", color: "#a0948a" },
  { value: "done", label: "הושלמה", color: "#55b48a" },
];

export const VIEWS: { value: ViewType; label: string; hint: string }[] = [
  { value: "kanban", label: "קנבן", hint: "עמודות לפי סטטוס, גוררים משימות ביניהן" },
  { value: "todo", label: "רשימת TODO", hint: "רשימה עם וי, ממוינת לפי עדיפות" },
  { value: "calendar", label: "לוח שנה", hint: "חודש שלם, כל משימה בתאריך היעד שלה" },
];

export const SPACE_COLORS = [
  "#7c8cf0",
  "#f0a35b",
  "#55b48a",
  "#e6789e",
  "#b67be0",
  "#e0613f",
  "#4fb0c6",
  "#d9a521",
  "#8fb35a",
  "#a0948a",
];

export const PRIORITY_BY_VALUE = Object.fromEntries(PRIORITIES.map((p) => [p.value, p])) as Record<
  Priority,
  (typeof PRIORITIES)[number]
>;
export const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map((s) => [s.value, s])) as Record<
  Status,
  (typeof STATUSES)[number]
>;

export const PRIORITY_VALUES = PRIORITIES.map((p) => p.value);
export const STATUS_VALUES = STATUSES.map((s) => s.value);
export const VIEW_VALUES = VIEWS.map((v) => v.value);

export const TIME_ZONE = "Asia/Jerusalem";
