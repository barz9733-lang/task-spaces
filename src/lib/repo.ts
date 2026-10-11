import { query } from "./db";
import { nextOccurrence, todayISO } from "./dates";
import type { AppData, Priority, Recurrence, Settings, Space, Status, Subtask, Task, TaskInput, ViewType } from "./types";

const TASK_COLS = `id, space_id, title, description, priority, status, due_date::text AS due_date,
  completed_at, recurrence, subtasks, created_at, updated_at`;

type Row = Record<string, unknown>;

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function mapTask(r: Row): Task {
  return {
    id: String(r.id),
    space_id: String(r.space_id),
    title: String(r.title),
    description: String(r.description ?? ""),
    priority: r.priority as Priority,
    status: r.status as Status,
    due_date: r.due_date ? String(r.due_date) : null,
    completed_at: iso(r.completed_at),
    recurrence: (r.recurrence as Recurrence | null) ?? null,
    subtasks: Array.isArray(r.subtasks) ? (r.subtasks as Subtask[]) : [],
    created_at: iso(r.created_at) as string,
    updated_at: iso(r.updated_at) as string,
  };
}

function mapSpace(r: Row): Space {
  return {
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    view: r.view as ViewType,
    position: Number(r.position),
  };
}

export async function listSpaces(): Promise<Space[]> {
  const rows = await query<Row>(`SELECT id, name, color, view, position FROM spaces ORDER BY position, created_at`);
  return rows.map(mapSpace);
}

export async function listTasks(spaceIds?: string[]): Promise<Task[]> {
  if (spaceIds && spaceIds.length === 0) return [];
  const rows = spaceIds
    ? await query<Row>(`SELECT ${TASK_COLS} FROM tasks WHERE space_id = ANY($1::uuid[]) ORDER BY created_at`, [spaceIds])
    : await query<Row>(`SELECT ${TASK_COLS} FROM tasks ORDER BY created_at`);
  return rows.map(mapTask);
}

export async function getSettings(): Promise<Settings> {
  const rows = await query<Row>(`SELECT value FROM settings WHERE key = 'dashboard_spaces'`);
  const v = rows[0]?.value;
  return { dashboard_spaces: Array.isArray(v) ? (v as string[]) : null };
}

export async function setDashboardSpaces(ids: string[] | null): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('dashboard_spaces', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(ids)],
  );
}

export async function getAllData(): Promise<AppData> {
  const [spaces, tasks, settings] = await Promise.all([listSpaces(), listTasks(), getSettings()]);
  return { spaces, tasks, settings };
}

/* ---------------- spaces ---------------- */

export async function createSpace(input: { name: string; color: string; view: ViewType }): Promise<Space> {
  const rows = await query<Row>(
    `INSERT INTO spaces (name, color, view, position)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM spaces), 0))
     RETURNING id, name, color, view, position`,
    [input.name, input.color, input.view],
  );
  return mapSpace(rows[0]);
}

export async function updateSpace(
  id: string,
  patch: Partial<{ name: string; color: string; view: ViewType }>,
): Promise<Space | null> {
  const rows = await query<Row>(
    `UPDATE spaces SET
       name = COALESCE($2, name),
       color = COALESCE($3, color),
       view = COALESCE($4, view)
     WHERE id = $1
     RETURNING id, name, color, view, position`,
    [id, patch.name ?? null, patch.color ?? null, patch.view ?? null],
  );
  return rows[0] ? mapSpace(rows[0]) : null;
}

export async function deleteSpace(id: string): Promise<boolean> {
  const rows = await query<Row>(`DELETE FROM spaces WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

/* ---------------- tasks ---------------- */

export async function createTask(input: TaskInput): Promise<Task> {
  const status = input.status ?? "new";
  const rows = await query<Row>(
    `INSERT INTO tasks (space_id, title, description, priority, status, due_date, completed_at, recurrence, subtasks)
     VALUES ($1, $2, $3, $4, $5, $6::date, CASE WHEN $5 = 'done' THEN now() ELSE NULL END, $7, $8::jsonb)
     RETURNING ${TASK_COLS}`,
    [
      input.space_id,
      input.title,
      input.description ?? "",
      input.priority ?? "medium",
      status,
      input.due_date ?? null,
      input.recurrence ?? null,
      JSON.stringify(input.subtasks ?? []),
    ],
  );
  return mapTask(rows[0]);
}

export async function createTasks(inputs: TaskInput[]): Promise<Task[]> {
  const out: Task[] = [];
  for (const input of inputs) out.push(await createTask(input));
  return out;
}

/** Fields present in `patch` (even null for due_date) are updated; the rest are left untouched. */
export async function updateTasks(ids: string[], patch: Partial<TaskInput>): Promise<{ tasks: Task[]; spawned: Task[] }> {
  if (ids.length === 0) return { tasks: [], spawned: [] };
  // tasks that are about to become done (to spawn the next occurrence of recurring ones)
  const becomingDone =
    patch.status === "done"
      ? (await query<Row>(`SELECT ${TASK_COLS} FROM tasks WHERE id = ANY($1::uuid[]) AND status <> 'done' AND recurrence IS NOT NULL`, [ids])).map(mapTask)
      : [];
  const sets: string[] = [];
  const params: unknown[] = [ids];
  const add = (col: string, val: unknown, cast = "") => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  if (patch.title !== undefined) add("title", patch.title);
  if (patch.description !== undefined) add("description", patch.description);
  if (patch.priority !== undefined) add("priority", patch.priority);
  if (patch.space_id !== undefined) add("space_id", patch.space_id, "::uuid");
  if ("recurrence" in patch) add("recurrence", patch.recurrence ?? null);
  if (patch.subtasks !== undefined) add("subtasks", JSON.stringify(patch.subtasks), "::jsonb");
  if ("due_date" in patch) add("due_date", patch.due_date ?? null, "::date");
  if (patch.status !== undefined) {
    add("status", patch.status);
    sets.push(
      patch.status === "done"
        ? `completed_at = COALESCE(completed_at, now())`
        : `completed_at = NULL`,
    );
  }
  if (sets.length === 0) {
    const rows = await query<Row>(`SELECT ${TASK_COLS} FROM tasks WHERE id = ANY($1::uuid[])`, [ids]);
    return { tasks: rows.map(mapTask), spawned: [] };
  }
  sets.push(`updated_at = now()`);
  const rows = await query<Row>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ANY($1::uuid[]) RETURNING ${TASK_COLS}`,
    params,
  );
  const spawned: Task[] = [];
  const today = todayISO();
  for (const t of becomingDone) {
    if (!t.recurrence || !t.due_date) continue;
    spawned.push(
      await createTask({
        space_id: t.space_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: "new",
        due_date: nextOccurrence(t.due_date, t.recurrence, today),
        recurrence: t.recurrence,
        subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
      }),
    );
  }
  return { tasks: rows.map(mapTask), spawned };
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<{ task: Task | null; spawned: Task[] }> {
  const r = await updateTasks([id], patch);
  return { task: r.tasks[0] ?? null, spawned: r.spawned };
}

export async function deleteTasks(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await query<Row>(`DELETE FROM tasks WHERE id = ANY($1::uuid[]) RETURNING id`, [ids]);
  return rows.length;
}

export async function spaceExists(id: string): Promise<boolean> {
  const rows = await query<Row>(`SELECT 1 FROM spaces WHERE id = $1`, [id]);
  return rows.length > 0;
}

/* ---------------- agent pending actions ---------------- */

export interface PendingAction {
  id: string;
  payload: unknown;
}

export async function savePending(payload: unknown): Promise<string> {
  const rows = await query<Row>(`INSERT INTO agent_pending (payload) VALUES ($1::jsonb) RETURNING id`, [
    JSON.stringify(payload),
  ]);
  // opportunistic cleanup
  await query(`DELETE FROM agent_pending WHERE created_at < now() - interval '1 day'`);
  return String(rows[0].id);
}

/** Atomically claims a pending action (valid for 30 minutes). */
export async function claimPending(id: string): Promise<unknown | null> {
  const rows = await query<Row>(
    `UPDATE agent_pending SET status = 'used'
     WHERE id = $1 AND status = 'pending' AND created_at > now() - interval '30 minutes'
     RETURNING payload`,
    [id],
  );
  return rows[0]?.payload ?? null;
}

/* ---------------- push subscriptions ---------------- */

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSub(sub: PushSub): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [sub.endpoint, sub.p256dh, sub.auth],
  );
}

export async function deletePushSub(endpoint: string): Promise<void> {
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export async function listPushSubs(): Promise<PushSub[]> {
  const rows = await query<Row>(`SELECT endpoint, p256dh, auth FROM push_subscriptions`);
  return rows.map((r) => ({ endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth) }));
}

/* ---------------- agent usage limit ---------------- */

/** Records one agent request; returns false when the hourly limit is exceeded. */
export async function takeAgentQuota(limitPerHour: number): Promise<boolean> {
  const rows = await query<Row>(
    `SELECT count(*)::int AS n FROM agent_usage WHERE kind = 'request' AND created_at > now() - interval '1 hour'`,
  );
  if (Number(rows[0]?.n ?? 0) >= limitPerHour) return false;
  await query(`INSERT INTO agent_usage DEFAULT VALUES`);
  await query(`DELETE FROM agent_usage WHERE created_at < now() - interval '400 days'`);
  return true;
}

export async function recordTokens(input: number, output: number): Promise<void> {
  await query(`INSERT INTO agent_usage (kind, input_tokens, output_tokens) VALUES ('tokens', $1, $2)`, [input, output]);
}

export interface UsageStats {
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

/** Usage since the start of the current month (Israel time) and today. */
export async function getUsage(): Promise<{ month: UsageStats; today: UsageStats }> {
  const q = async (since: string): Promise<UsageStats> => {
    const rows = await query<Row>(
      `SELECT count(*) FILTER (WHERE kind = 'request')::int AS requests,
              COALESCE(sum(input_tokens), 0)::bigint AS input_tokens,
              COALESCE(sum(output_tokens), 0)::bigint AS output_tokens
       FROM agent_usage WHERE created_at >= $1::timestamptz`,
      [since],
    );
    const r = rows[0] ?? {};
    return { requests: Number(r.requests ?? 0), input_tokens: Number(r.input_tokens ?? 0), output_tokens: Number(r.output_tokens ?? 0) };
  };
  const today = todayISO();
  const tz = "T00:00:00+03:00"; // close enough for a usage counter
  return { month: await q(today.slice(0, 7) + "-01" + tz), today: await q(today + tz) };
}
