import type { Priority, Status, ViewType } from "./types";

export const PRIORITIES: { value: Priority; label: string; color: string; rank: number }[] = [
  { value: "urgent", label: "דחוף", color: "#ef4444", rank: 4 },
  { value: "high", label: "גבוהה", color: "#f97316", rank: 3 },
  { value: "medium", label: "בינונית", color: "#eab308", rank: 2 },
  { value: "low", label: "נמוכה", color: "#3b82f6", rank: 1 },
];

export const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: "new", label: "חדשה", color: "#06b6d4" },
  { value: "in_progress", label: "בעבודה", color: "#8b5cf6" },
  { value: "on_hold", label: "בהשהייה", color: "#94a3b8" },
  { value: "done", label: "הושלמה", color: "#22c55e" },
];

export const VIEWS: { value: ViewType; label: string; hint: string }[] = [
  { value: "kanban", label: "קנבן", hint: "עמודות לפי סטטוס, גוררים משימות ביניהן" },
  { value: "todo", label: "רשימת TODO", hint: "רשימה עם וי, ממוינת לפי עדיפות" },
  { value: "calendar", label: "לוח שנה", hint: "חודש שלם, כל משימה בתאריך היעד שלה" },
];

export const SPACE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#06b6d4",
  "#0ea5e9",
  "#14b8a6",
  "#10b981",
  "#84cc16",
  "#a78bfa",
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
