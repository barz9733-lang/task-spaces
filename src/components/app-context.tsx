"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayISO } from "@/lib/dates";
import type { AppData, Settings, Space, Task, TaskInput, ViewType } from "@/lib/types";

export type TaskEditorTarget = { id: string } | { draft: Partial<TaskInput> };
export type SpaceEditorTarget = { mode: "new" } | { mode: "edit"; id: string };

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

interface AppCtx {
  spaces: Space[];
  tasks: Task[];
  settings: Settings;
  today: string;
  refresh: () => Promise<void>;
  createTask: (input: TaskInput) => Promise<Task | null>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createSpace: (input: { name: string; color: string; view: ViewType }) => Promise<Space | null>;
  updateSpace: (id: string, patch: Partial<{ name: string; color: string; view: ViewType }>) => Promise<void>;
  deleteSpace: (id: string) => Promise<boolean>;
  setDashboardSpaces: (ids: string[] | null) => Promise<void>;
  taskEditor: TaskEditorTarget | null;
  openTask: (t: TaskEditorTarget) => void;
  closeTask: () => void;
  spaceEditor: SpaceEditorTarget | null;
  openSpaceEditor: (t: SpaceEditorTarget) => void;
  closeSpaceEditor: () => void;
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("לא מחובר");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "הפעולה נכשלה");
  return data as T;
}

function sortSpaces(s: Space[]) {
  return [...s].sort((a, b) => a.position - b.position);
}

export function AppProvider({ initial, children }: { initial: AppData; children: ReactNode }) {
  const [spaces, setSpaces] = useState<Space[]>(initial.spaces);
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [today, setToday] = useState(() => todayISO());
  const [taskEditor, setTaskEditor] = useState<TaskEditorTarget | null>(null);
  const [spaceEditor, setSpaceEditor] = useState<SpaceEditorTarget | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const refreshSeq = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const data = await api<AppData>("/api/data");
      if (seq !== refreshSeq.current) return; // a newer refresh superseded this one
      setSpaces(sortSpaces(data.spaces));
      setTasks(data.tasks);
      setSettings(data.settings);
    } catch {
      /* keep the current state */
    }
  }, []);

  // keep "today" correct across midnight, and re-sync when the tab regains focus
  useEffect(() => {
    const tick = () => setToday(todayISO());
    const iv = setInterval(tick, 60_000);
    const onFocus = () => {
      tick();
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const createTask = useCallback<AppCtx["createTask"]>(
    async (input) => {
      try {
        const t = await api<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) });
        setTasks((prev) => [...prev, t]);
        return t;
      } catch (e) {
        toast((e as Error).message, "error");
        return null;
      }
    },
    [toast],
  );

  const updateTask = useCallback<AppCtx["updateTask"]>(
    async (id, patch) => {
      // optimistic
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next: Task = { ...t, ...patch } as Task;
          if (patch.status !== undefined) {
            next.completed_at = patch.status === "done" ? (t.completed_at ?? new Date().toISOString()) : null;
          }
          return next;
        }),
      );
      try {
        const { spawned, ...saved } = await api<Task & { spawned: Task | null }>(`/api/tasks/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setTasks((prev) => {
          const next = prev.map((t) => (t.id === id ? (saved as Task) : t));
          return spawned && !next.some((t) => t.id === spawned.id) ? [...next, spawned] : next;
        });
        if (spawned) toast(`נוצרה המשימה הבאה לתאריך ${spawned.due_date?.split("-").reverse().join("/")}`);
      } catch (e) {
        toast((e as Error).message, "error");
        refresh();
      }
    },
    [toast, refresh],
  );

  const deleteTask = useCallback<AppCtx["deleteTask"]>(
    async (id) => {
      const before = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
      } catch (e) {
        setTasks(before);
        toast((e as Error).message, "error");
      }
    },
    [tasks, toast],
  );

  const createSpace = useCallback<AppCtx["createSpace"]>(
    async (input) => {
      try {
        const s = await api<Space>("/api/spaces", { method: "POST", body: JSON.stringify(input) });
        setSpaces((prev) => sortSpaces([...prev, s]));
        return s;
      } catch (e) {
        toast((e as Error).message, "error");
        return null;
      }
    },
    [toast],
  );

  const updateSpace = useCallback<AppCtx["updateSpace"]>(
    async (id, patch) => {
      setSpaces((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      try {
        const saved = await api<Space>(`/api/spaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
        setSpaces((prev) => prev.map((s) => (s.id === id ? saved : s)));
      } catch (e) {
        toast((e as Error).message, "error");
        refresh();
      }
    },
    [toast, refresh],
  );

  const deleteSpace = useCallback<AppCtx["deleteSpace"]>(
    async (id) => {
      try {
        await api(`/api/spaces/${id}`, { method: "DELETE" });
        setSpaces((prev) => prev.filter((s) => s.id !== id));
        setTasks((prev) => prev.filter((t) => t.space_id !== id));
        return true;
      } catch (e) {
        toast((e as Error).message, "error");
        return false;
      }
    },
    [toast],
  );

  const setDashboardSpaces = useCallback<AppCtx["setDashboardSpaces"]>(
    async (ids) => {
      setSettings((s) => ({ ...s, dashboard_spaces: ids }));
      try {
        await api("/api/settings", { method: "PUT", body: JSON.stringify({ dashboard_spaces: ids }) });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [toast],
  );

  const value = useMemo<AppCtx>(
    () => ({
      spaces,
      tasks,
      settings,
      today,
      refresh,
      createTask,
      updateTask,
      deleteTask,
      createSpace,
      updateSpace,
      deleteSpace,
      setDashboardSpaces,
      taskEditor,
      openTask: setTaskEditor,
      closeTask: () => setTaskEditor(null),
      spaceEditor,
      openSpaceEditor: setSpaceEditor,
      closeSpaceEditor: () => setSpaceEditor(null),
      toasts,
      toast,
    }),
    [
      spaces,
      tasks,
      settings,
      today,
      refresh,
      createTask,
      updateTask,
      deleteTask,
      createSpace,
      updateSpace,
      deleteSpace,
      setDashboardSpaces,
      taskEditor,
      spaceEditor,
      toasts,
      toast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
