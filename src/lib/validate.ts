import { PRIORITY_VALUES, STATUS_VALUES, VIEW_VALUES } from "./constants";
import { isISODate } from "./dates";
import type { Priority, Status, TaskInput, ViewType } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUUID = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

function obj(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "גוף הבקשה לא תקין");
  return body as Record<string, unknown>;
}

export function parseTask(body: unknown, partial: boolean): Partial<TaskInput> {
  const b = obj(body);
  const out: Partial<TaskInput> = {};
  if ("title" in b || !partial) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (!t) throw new ApiError(400, "חסרה כותרת למשימה");
    if (t.length > 300) throw new ApiError(400, "הכותרת ארוכה מדי");
    out.title = t;
  }
  if ("description" in b && b.description != null) {
    if (typeof b.description !== "string" || b.description.length > 5000) throw new ApiError(400, "תיאור לא תקין");
    out.description = b.description;
  }
  if ("priority" in b && b.priority != null) {
    if (!PRIORITY_VALUES.includes(b.priority as Priority)) throw new ApiError(400, "עדיפות לא תקינה");
    out.priority = b.priority as Priority;
  }
  if ("status" in b && b.status != null) {
    if (!STATUS_VALUES.includes(b.status as Status)) throw new ApiError(400, "סטטוס לא תקין");
    out.status = b.status as Status;
  }
  if ("due_date" in b) {
    if (b.due_date === null || b.due_date === "") out.due_date = null;
    else if (isISODate(b.due_date)) out.due_date = b.due_date;
    else throw new ApiError(400, "תאריך יעד לא תקין");
  }
  if ("space_id" in b || !partial) {
    if (!isUUID(b.space_id)) throw new ApiError(400, "מרחב לא תקין");
    out.space_id = b.space_id;
  }
  return out;
}

export function parseSpace(
  body: unknown,
  partial: boolean,
): Partial<{ name: string; color: string; view: ViewType }> {
  const b = obj(body);
  const out: Partial<{ name: string; color: string; view: ViewType }> = {};
  if ("name" in b || !partial) {
    const n = typeof b.name === "string" ? b.name.trim() : "";
    if (!n) throw new ApiError(400, "חסר שם למרחב");
    if (n.length > 60) throw new ApiError(400, "השם ארוך מדי");
    out.name = n;
  }
  if ("color" in b || !partial) {
    if (typeof b.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(b.color)) throw new ApiError(400, "צבע לא תקין");
    out.color = b.color;
  }
  if ("view" in b || !partial) {
    if (!VIEW_VALUES.includes(b.view as ViewType)) throw new ApiError(400, "תצוגה לא תקינה");
    out.view = b.view as ViewType;
  }
  return out;
}
