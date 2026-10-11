import { PRIORITY_BY_VALUE, PRIORITY_VALUES, RECURRENCE_VALUES, STATUS_BY_VALUE, STATUS_VALUES } from "../constants";
import { addDays, diffDays, formatShort, isISODate, isoToLocalDate, weekStart } from "../dates";
import * as repo from "../repo";
import type { Priority, Recurrence, Space, Status, Task, TaskInput } from "../types";

/* ------------------------------------------------------------------ */
/* Tool definitions (Responses API function tools)                    */
/* ------------------------------------------------------------------ */

const nullable = (schema: Record<string, unknown>) => ({
  ...schema,
  type: [schema.type as string, "null"],
});
const nullableEnum = (values: string[], description?: string) => ({
  type: ["string", "null"],
  enum: [...values, null],
  ...(description ? { description } : {}),
});

/* All schemas are strict: every property is required and "not specified" is sent as null. */
const FILTER_SCHEMA = {
  type: ["object", "null"],
  description:
    "Selects tasks inside the current scope; every given condition must match; use null for conditions you do not need. A filter with all-null fields means ALL tasks in scope.",
  properties: {
    status: nullable({ type: "array", items: { type: "string", enum: STATUS_VALUES } }),
    priority: nullable({ type: "array", items: { type: "string", enum: PRIORITY_VALUES } }),
    overdue: nullable({ type: "boolean", description: "true = due date is before today and the task is not done" }),
    due_today: nullable({ type: "boolean" }),
    due_from: nullable({ type: "string", description: "YYYY-MM-DD, inclusive" }),
    due_to: nullable({ type: "string", description: "YYYY-MM-DD, inclusive" }),
    no_due_date: nullable({ type: "boolean", description: "true = only tasks without a due date" }),
    search: nullable({ type: "string", description: "Case-insensitive text contained in the title or description" }),
    space: nullable({ type: "string", description: "Space name. Only relevant when the scope is all spaces." }),
  },
  required: ["status", "priority", "overdue", "due_today", "due_from", "due_to", "no_due_date", "search", "space"],
  additionalProperties: false,
};

const TASK_IDS = nullable({
  type: "array",
  items: { type: "string" },
  description: "Task ids exactly as returned by read_tasks. Null when using a filter.",
});

export const TOOL_DEFS = [
  {
    type: "function",
    name: "read_tasks",
    description: "Read tasks in the current scope, optionally filtered. Returns up to 100 tasks.",
    strict: true,
    parameters: {
      type: "object",
      properties: { filter: FILTER_SCHEMA },
      required: ["filter"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "add_tasks",
    description:
      "Create one or more tasks. When the scope is a single space, tasks are created in it. When the scope is all spaces, every task must name its space.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              space: nullable({ type: "string", description: "Space name (required when scope is all spaces)" }),
              description: nullable({ type: "string" }),
              priority: nullableEnum(PRIORITY_VALUES, "null = medium"),
              status: nullableEnum(STATUS_VALUES, "null = new"),
              due_date: nullable({ type: "string", description: "YYYY-MM-DD, or null for no due date" }),
              recurrence: nullableEnum(RECURRENCE_VALUES, "repeats every day/week/month/year; null = does not repeat. Needs a due_date."),
            },
            required: ["title", "space", "description", "priority", "status", "due_date", "recurrence"],
            additionalProperties: false,
          },
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_tasks",
    description:
      "Change fields on existing tasks. Select the tasks with task_ids OR a filter (prefer filter for bulk requests such as 'all overdue tasks'; set the other to null). In changes, use null for every field that must stay as it is.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        task_ids: TASK_IDS,
        filter: FILTER_SCHEMA,
        changes: {
          type: "object",
          properties: {
            title: nullable({ type: "string" }),
            description: nullable({ type: "string" }),
            status: nullableEnum(STATUS_VALUES),
            priority: nullableEnum(PRIORITY_VALUES),
            due_date: nullable({ type: "string", description: "New due date YYYY-MM-DD for all selected tasks" }),
            clear_due_date: nullable({ type: "boolean", description: "true = remove the due date" }),
            recurrence: nullableEnum([...RECURRENCE_VALUES, "none"], "set how the task repeats; 'none' = stop repeating; null = unchanged"),
            shift_due_days: nullable({
              type: "integer",
              description:
                "Move each task's own due date by this many days (negative = earlier). Tasks without a due date are untouched.",
            }),
            space: nullable({ type: "string", description: "Move the tasks to another space (by name)" }),
          },
          required: ["title", "description", "status", "priority", "due_date", "clear_due_date", "recurrence", "shift_due_days", "space"],
          additionalProperties: false,
        },
      },
      required: ["task_ids", "filter", "changes"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "delete_tasks",
    description:
      "Permanently delete tasks. Select with task_ids OR a filter (the other null). The user is always asked to confirm before anything is deleted.",
    strict: true,
    parameters: {
      type: "object",
      properties: { task_ids: TASK_IDS, filter: FILTER_SCHEMA },
      required: ["task_ids", "filter"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "summarize_tasks",
    description:
      "Aggregated overview of the tasks in scope: counts by status, priority and space, overdue / due today / due soon, completed this week, and the tasks that need attention most. Use it for 'what is important', 'how am I doing' style questions.",
    strict: true,
    parameters: {
      type: "object",
      properties: { filter: FILTER_SCHEMA },
      required: ["filter"],
      additionalProperties: false,
    },
  },
] as const;

export const TOOL_STATUS_TEXT: Record<string, string> = {
  read_tasks: "קורא משימות…",
  add_tasks: "מוסיף משימות…",
  update_tasks: "מעדכן משימות…",
  delete_tasks: "מוחק משימות…",
  summarize_tasks: "מסכם משימות…",
};

/* ------------------------------------------------------------------ */
/* Context + helpers                                                  */
/* ------------------------------------------------------------------ */

export interface ToolCtx {
  scopeSpaces: Space[];
  allScope: boolean;
  today: string;
}

type Json = Record<string, unknown>;

const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8);

const HE_PRIORITY: Record<string, Priority> = {
  נמוכה: "low",
  נמוך: "low",
  בינונית: "medium",
  בינוני: "medium",
  גבוהה: "high",
  גבוה: "high",
  דחוף: "urgent",
  דחופה: "urgent",
};
const HE_STATUS: Record<string, Status> = {
  חדשה: "new",
  חדש: "new",
  בעבודה: "in_progress",
  "בתהליך": "in_progress",
  בהשהייה: "on_hold",
  מושהית: "on_hold",
  הושלמה: "done",
  הושלם: "done",
  בוצעה: "done",
};

function normPriority(v: unknown): Priority | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (PRIORITY_VALUES.includes(s as Priority)) return s as Priority;
  return HE_PRIORITY[s] ?? null;
}
function normStatus(v: unknown): Status | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (STATUS_VALUES.includes(s as Status)) return s as Status;
  return HE_STATUS[s] ?? null;
}

const HE_RECURRENCE: Record<string, Recurrence> = {
  "כל יום": "daily",
  יומי: "daily",
  "כל שבוע": "weekly",
  שבועי: "weekly",
  "כל חודש": "monthly",
  חודשי: "monthly",
  "כל שנה": "yearly",
  שנתי: "yearly",
};
function normRecurrence(v: unknown): Recurrence | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (RECURRENCE_VALUES.includes(s as Recurrence)) return s as Recurrence;
  return HE_RECURRENCE[s] ?? null;
}

const norm = (s: string) => s.replace(/["'׳״\s]/g, "").toLowerCase();

function findSpace(name: unknown, ctx: ToolCtx): Space | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = norm(name);
  const spaces = ctx.scopeSpaces;
  return (
    spaces.find((s) => norm(s.name) === n) ??
    spaces.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name))) ??
    null
  );
}

function taskView(t: Task, spaceName: Map<string, string>, today: string) {
  return {
    id: shortId(t.id),
    title: t.title,
    ...(t.description ? { description: t.description.slice(0, 160) } : {}),
    space: spaceName.get(t.space_id) ?? "",
    priority: t.priority,
    status: t.status,
    due_date: t.due_date,
    ...(t.recurrence ? { repeats: t.recurrence } : {}),
    ...(t.subtasks.length ? { subtasks_done: `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` } : {}),
    ...(t.due_date && t.status !== "done" && t.due_date < today ? { overdue: true } : {}),
  };
}

const spaceNames = (ctx: ToolCtx) => new Map(ctx.scopeSpaces.map((s) => [s.id, s.name]));

async function scopeTasks(ctx: ToolCtx): Promise<Task[]> {
  return repo.listTasks(ctx.scopeSpaces.map((s) => s.id));
}

class ToolError extends Error {}

function applyFilter(tasks: Task[], raw: unknown, ctx: ToolCtx): Task[] {
  const f = (raw && typeof raw === "object" ? raw : {}) as Json;
  let out = tasks;

  if (Array.isArray(f.status) && f.status.length) {
    const set = new Set(f.status.map(normStatus).filter(Boolean));
    out = out.filter((t) => set.has(t.status));
  }
  if (Array.isArray(f.priority) && f.priority.length) {
    const set = new Set(f.priority.map(normPriority).filter(Boolean));
    out = out.filter((t) => set.has(t.priority));
  }
  if (f.overdue === true) out = out.filter((t) => t.due_date && t.status !== "done" && t.due_date < ctx.today);
  if (f.due_today === true) out = out.filter((t) => t.due_date === ctx.today);
  if (typeof f.due_from === "string" && isISODate(f.due_from)) {
    const from = f.due_from;
    out = out.filter((t) => t.due_date && t.due_date >= from);
  }
  if (typeof f.due_to === "string" && isISODate(f.due_to)) {
    const to = f.due_to;
    out = out.filter((t) => t.due_date && t.due_date <= to);
  }
  if (f.no_due_date === true) out = out.filter((t) => !t.due_date);
  if (typeof f.search === "string" && f.search.trim()) {
    const s = f.search.trim().toLowerCase();
    out = out.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(s));
  }
  if (ctx.allScope && typeof f.space === "string" && f.space.trim()) {
    const sp = findSpace(f.space, ctx);
    if (!sp) throw new ToolError(`המרחב "${f.space}" לא נמצא. מרחבים קיימים: ${ctx.scopeSpaces.map((s) => s.name).join(", ")}`);
    out = out.filter((t) => t.space_id === sp.id);
  }
  return out;
}

function selectTasks(all: Task[], args: Json, ctx: ToolCtx): Task[] {
  if (Array.isArray(args.task_ids) && args.task_ids.length) {
    const wanted = args.task_ids.map((x) => String(x).toLowerCase().replace(/-/g, ""));
    const found: Task[] = [];
    const missing: string[] = [];
    for (const w of wanted) {
      const t = all.find((t) => t.id.replace(/-/g, "").startsWith(w) && w.length >= 6);
      if (t) found.push(t);
      else missing.push(w);
    }
    if (missing.length && !found.length) throw new ToolError(`לא נמצאו משימות עם המזהים: ${missing.join(", ")}. יש לקרוא קודם עם read_tasks.`);
    return [...new Map(found.map((t) => [t.id, t])).values()];
  }
  if (args.filter && typeof args.filter === "object") return applyFilter(all, args.filter, ctx);
  throw new ToolError("יש לציין task_ids או filter (filter ריק {} = כל המשימות במרחב הנבחר).");
}

/* ------------------------------------------------------------------ */
/* Operations (what the user may be asked to confirm)                 */
/* ------------------------------------------------------------------ */

export type Operation =
  | { kind: "add"; items: TaskInput[]; titles: string[]; summary: string }
  | { kind: "update"; updates: { id: string; title: string; patch: Partial<TaskInput> }[]; titles: string[]; summary: string }
  | { kind: "delete"; ids: string[]; titles: string[]; summary: string };

export type Prepared =
  | { type: "result"; output: unknown }
  | { type: "op"; op: Operation; count: number };

export function opCount(op: Operation): number {
  return op.kind === "add" ? op.items.length : op.kind === "update" ? op.updates.length : op.ids.length;
}

export function needsConfirmation(op: Operation): boolean {
  const n = opCount(op);
  if (n === 0) return false;
  return op.kind === "delete" || n > 3;
}

function describePatch(c: Json, ctx: ToolCtx, spaceTarget?: Space | null): string {
  const parts: string[] = [];
  if (c.status) parts.push(`סטטוס "${STATUS_BY_VALUE[c.status as Status].label}"`);
  if (c.priority) parts.push(`עדיפות "${PRIORITY_BY_VALUE[c.priority as Priority].label}"`);
  if (c.clear_due_date === true) parts.push("הסרת תאריך יעד");
  else if (typeof c.due_date === "string" && c.due_date) parts.push(`תאריך יעד ${formatShort(c.due_date, ctx.today)}`);
  if (typeof c.shift_due_days === "number" && c.shift_due_days !== 0)
    parts.push(`הזזת תאריך היעד ב-${Math.abs(c.shift_due_days)} ימים ${c.shift_due_days > 0 ? "קדימה" : "אחורה"}`);
  if (c.recurrence) parts.push(c.recurrence === "none" ? "ביטול חזרתיות" : "הגדרת חזרתיות");
  if (c.title) parts.push("שינוי כותרת");
  if (typeof c.description === "string" && c.description) parts.push("שינוי תיאור");
  if (spaceTarget) parts.push(`העברה למרחב "${spaceTarget.name}"`);
  return parts.join(", ");
}

async function prepareAdd(args: Json, ctx: ToolCtx): Promise<Prepared> {
  const list = Array.isArray(args.tasks) ? (args.tasks as Json[]) : [];
  if (!list.length) throw new ToolError("לא התקבלו משימות להוספה.");
  const items: TaskInput[] = [];
  for (const raw of list) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) throw new ToolError("לכל משימה חייבת להיות כותרת.");
    let space: Space | null;
    if (!ctx.allScope) {
      space = ctx.scopeSpaces[0];
    } else {
      space = findSpace(raw.space, ctx);
      if (!space)
        throw new ToolError(
          `חסר מרחב למשימה "${title}" או שהמרחב לא קיים. מרחבים קיימים: ${ctx.scopeSpaces.map((s) => s.name).join(", ")}`,
        );
    }
    let due: string | null = null;
    if (raw.due_date != null && raw.due_date !== "") {
      if (!isISODate(raw.due_date)) throw new ToolError(`תאריך לא תקין: ${String(raw.due_date)} (נדרש YYYY-MM-DD)`);
      due = raw.due_date;
    }
    items.push({
      space_id: space.id,
      title: title.slice(0, 300),
      description: typeof raw.description === "string" ? raw.description.slice(0, 5000) : "",
      priority: normPriority(raw.priority) ?? "medium",
      status: normStatus(raw.status) ?? "new",
      due_date: due,
      recurrence: due ? normRecurrence(raw.recurrence) : null,
    });
  }
  const sn = spaceNames(ctx);
  return {
    type: "op",
    count: items.length,
    op: {
      kind: "add",
      items,
      titles: items.map((i) => (ctx.allScope ? `${i.title} (${sn.get(i.space_id)})` : i.title)),
      summary: `להוסיף ${items.length} משימות`,
    },
  };
}

async function prepareUpdate(args: Json, ctx: ToolCtx): Promise<Prepared> {
  const c = (args.changes && typeof args.changes === "object" ? args.changes : {}) as Json;
  const base: Partial<TaskInput> = {};
  if (typeof c.title === "string" && c.title.trim()) base.title = c.title.trim().slice(0, 300);
  if (typeof c.description === "string" && c.description) base.description = c.description.slice(0, 5000);
  if (c.status != null) {
    const s = normStatus(c.status);
    if (!s) throw new ToolError(`סטטוס לא תקין: ${String(c.status)}`);
    base.status = s;
  }
  if (c.priority != null) {
    const p = normPriority(c.priority);
    if (!p) throw new ToolError(`עדיפות לא תקינה: ${String(c.priority)}`);
    base.priority = p;
  }
  if (c.recurrence != null && c.recurrence !== "") {
    if (c.recurrence === "none") base.recurrence = null;
    else {
      const r = normRecurrence(c.recurrence);
      if (!r) throw new ToolError(`חזרתיות לא תקינה: ${String(c.recurrence)}`);
      base.recurrence = r;
    }
  }
  let fixedDue: string | null | undefined;
  if (c.clear_due_date === true) fixedDue = null;
  else if (c.due_date != null && c.due_date !== "") {
    if (isISODate(c.due_date)) fixedDue = c.due_date;
    else throw new ToolError(`תאריך לא תקין: ${String(c.due_date)} (נדרש YYYY-MM-DD)`);
  }
  const shift = typeof c.shift_due_days === "number" && Number.isInteger(c.shift_due_days) ? c.shift_due_days : 0;
  let target: Space | null = null;
  if (c.space != null && c.space !== "") {
    if (!ctx.allScope) throw new ToolError("בסביבת עבודה של מרחב בודד אי אפשר להעביר משימות למרחב אחר. יש לעבור לבחירה 'כל המרחבים'.");
    target = findSpace(c.space, ctx);
    if (!target) throw new ToolError(`המרחב "${String(c.space)}" לא נמצא. מרחבים קיימים: ${ctx.scopeSpaces.map((s) => s.name).join(", ")}`);
    base.space_id = target.id;
  }
  if (!Object.keys(base).length && fixedDue === undefined && !shift)
    throw new ToolError("לא צוין שינוי כלשהו ב-changes.");

  const all = await scopeTasks(ctx);
  const selected = selectTasks(all, args, ctx);

  const updates: { id: string; title: string; patch: Partial<TaskInput> }[] = [];
  for (const t of selected) {
    const patch: Partial<TaskInput> = {};
    for (const [k, v] of Object.entries(base)) {
      if ((t as unknown as Json)[k] !== v) (patch as Json)[k] = v;
    }
    let newDue: string | null | undefined = fixedDue;
    if (newDue === undefined && shift && t.due_date) newDue = addDays(t.due_date, shift);
    if (newDue !== undefined && newDue !== t.due_date) patch.due_date = newDue;
    if (Object.keys(patch).length) updates.push({ id: t.id, title: t.title, patch });
  }
  const desc = describePatch({ ...c, status: base.status, priority: base.priority }, ctx, target);
  return {
    type: "op",
    count: updates.length,
    op: {
      kind: "update",
      updates,
      titles: updates.map((u) => u.title),
      summary: `לעדכן ${updates.length} משימות — ${desc}`,
    },
  };
}

async function prepareDelete(args: Json, ctx: ToolCtx): Promise<Prepared> {
  const all = await scopeTasks(ctx);
  const selected = selectTasks(all, args, ctx);
  return {
    type: "op",
    count: selected.length,
    op: {
      kind: "delete",
      ids: selected.map((t) => t.id),
      titles: selected.map((t) => t.title),
      summary: `למחוק ${selected.length} משימות לצמיתות`,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Read-only tools                                                    */
/* ------------------------------------------------------------------ */

async function runRead(args: Json, ctx: ToolCtx) {
  const all = await scopeTasks(ctx);
  const filtered = applyFilter(all, args.filter, ctx);
  const sn = spaceNames(ctx);
  const sorted = [...filtered].sort(
    (a, b) =>
      (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      PRIORITY_BY_VALUE[b.priority].rank - PRIORITY_BY_VALUE[a.priority].rank,
  );
  return {
    total_matching: sorted.length,
    shown: Math.min(sorted.length, 100),
    tasks: sorted.slice(0, 100).map((t) => taskView(t, sn, ctx.today)),
  };
}

function attentionScore(t: Task, today: string): number {
  let s = PRIORITY_BY_VALUE[t.priority].rank * 10;
  if (t.due_date) {
    const d = diffDays(t.due_date, today);
    if (d < 0) s += 30 + Math.min(-d, 10);
    else if (d === 0) s += 25;
    else if (d <= 3) s += 15;
    else if (d <= 7) s += 6;
  }
  if (t.status === "in_progress") s += 2;
  if (t.status === "on_hold") s -= 4;
  return s;
}

async function runSummarize(args: Json, ctx: ToolCtx) {
  const all = await scopeTasks(ctx);
  const tasks = applyFilter(all, args.filter, ctx);
  const open = tasks.filter((t) => t.status !== "done");
  const sn = spaceNames(ctx);
  const wkStart = weekStart(ctx.today);

  const count = <K extends string>(items: Task[], key: (t: Task) => K) => {
    const o: Record<string, number> = {};
    for (const t of items) o[key(t)] = (o[key(t)] ?? 0) + 1;
    return o;
  };
  const doneThisWeek = tasks.filter(
    (t) => t.status === "done" && t.completed_at && isoToLocalDate(t.completed_at) >= wkStart,
  );

  return {
    scope: ctx.allScope ? "כל המרחבים" : ctx.scopeSpaces[0].name,
    today: ctx.today,
    total_tasks: tasks.length,
    open_tasks: open.length,
    by_status: count(tasks, (t) => STATUS_BY_VALUE[t.status].label),
    open_by_priority: count(open, (t) => PRIORITY_BY_VALUE[t.priority].label),
    overdue: open.filter((t) => t.due_date && t.due_date < ctx.today).length,
    due_today: open.filter((t) => t.due_date === ctx.today).length,
    due_next_7_days: open.filter((t) => t.due_date && t.due_date > ctx.today && t.due_date <= addDays(ctx.today, 7)).length,
    open_without_due_date: open.filter((t) => !t.due_date).length,
    completed_this_week: doneThisWeek.length,
    per_space: ctx.scopeSpaces.map((s) => {
      const ts = tasks.filter((t) => t.space_id === s.id);
      const o = ts.filter((t) => t.status !== "done");
      return {
        space: s.name,
        open: o.length,
        overdue: o.filter((t) => t.due_date && t.due_date < ctx.today).length,
        completed_this_week: doneThisWeek.filter((t) => t.space_id === s.id).length,
      };
    }),
    most_important_open_tasks: [...open]
      .sort((a, b) => attentionScore(b, ctx.today) - attentionScore(a, ctx.today))
      .slice(0, 8)
      .map((t) => taskView(t, sn, ctx.today)),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function prepareTool(name: string, args: Json, ctx: ToolCtx): Promise<Prepared> {
  try {
    switch (name) {
      case "read_tasks":
        return { type: "result", output: await runRead(args, ctx) };
      case "summarize_tasks":
        return { type: "result", output: await runSummarize(args, ctx) };
      case "add_tasks":
        return await prepareAdd(args, ctx);
      case "update_tasks":
        return await prepareUpdate(args, ctx);
      case "delete_tasks":
        return await prepareDelete(args, ctx);
      default:
        return { type: "result", output: { error: `כלי לא מוכר: ${name}` } };
    }
  } catch (e) {
    if (e instanceof ToolError) return { type: "result", output: { error: e.message } };
    throw e;
  }
}

/** Executes an already-validated operation. Ids are re-checked against the scope. */
export async function applyOperation(op: Operation, ctx: ToolCtx): Promise<unknown> {
  const inScope = new Set(ctx.scopeSpaces.map((s) => s.id));
  if (op.kind === "add") {
    const items = op.items.filter((i) => inScope.has(i.space_id));
    const created = await repo.createTasks(items);
    return { ok: true, added: created.length, titles: created.map((t) => t.title) };
  }
  const existing = new Map((await scopeTasks(ctx)).map((t) => [t.id, t]));
  if (op.kind === "delete") {
    const ids = op.ids.filter((id) => existing.has(id));
    const n = await repo.deleteTasks(ids);
    return { ok: true, deleted: n };
  }
  const groups = new Map<string, { ids: string[]; patch: Partial<TaskInput> }>();
  for (const u of op.updates) {
    if (!existing.has(u.id)) continue;
    const key = JSON.stringify(u.patch);
    const g = groups.get(key) ?? { ids: [], patch: u.patch };
    g.ids.push(u.id);
    groups.set(key, g);
  }
  let updated = 0;
  for (const g of groups.values()) updated += (await repo.updateTasks(g.ids, g.patch)).tasks.length;
  return { ok: true, updated };
}

export function opChangedAnything(output: unknown): boolean {
  const o = output as Json;
  return !!o && o.ok === true && Number(o.added ?? o.updated ?? o.deleted ?? 0) > 0;
}

export function noopOutput(op: Operation) {
  return {
    ok: true,
    note:
      op.kind === "update"
        ? "אין משימות שדורשות שינוי (הן כבר במצב המבוקש או שלא נמצאו משימות מתאימות)."
        : "לא נמצאו משימות מתאימות, לא בוצע שינוי.",
    updated: 0,
  };
}
