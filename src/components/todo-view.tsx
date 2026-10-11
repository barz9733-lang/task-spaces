"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ListChecks, Plus } from "lucide-react";
import { PRIORITIES } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";
import { useApp } from "./app-context";
import { Checkbox, DuePill, EmptyState, StatusTag, TaskBadges, byPriorityThenDue } from "./ui";

function Row({ task, today }: { task: Task; today: string }) {
  const { updateTask, openTask } = useApp();
  const done = task.status === "done";
  const color = PRIORITIES.find((p) => p.value === task.priority)!.color;
  return (
    <li
      className={`trow ${done ? "is-done" : ""}`}
      style={{ ["--c" as string]: color }}
      onClick={() => openTask({ id: task.id })}
    >
      <Checkbox
        checked={done}
        color={color}
        label={done ? `סימון "${task.title}" כלא הושלמה` : `סימון "${task.title}" כהושלמה`}
        onChange={(v) => updateTask(task.id, { status: v ? "done" : "new" })}
      />
      <div className="trow-main">
        <span className="trow-title">{task.title}</span>
        {task.description && <span className="trow-desc">{task.description}</span>}
      </div>
      {task.status !== "new" && !done && <StatusTag status={task.status} />}
      <TaskBadges task={task} />
      <DuePill task={task} today={today} />
    </li>
  );
}

export function TodoView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, createTask } = useApp();
  const [title, setTitle] = useState("");
  const [showDone, setShowDone] = useState(false);

  const groups = useMemo(
    () =>
      PRIORITIES.map((p) => ({
        ...p,
        tasks: tasks.filter((t) => t.status !== "done" && t.priority === p.value).sort(byPriorityThenDue),
      })).filter((g) => g.tasks.length > 0),
    [tasks],
  );
  const done = useMemo(
    () => tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
    [tasks],
  );

  async function quickAdd() {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    await createTask({ space_id: space.id, title: t });
  }

  return (
    <div className="todo">
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
      >
        <Plus size={18} />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="הוסיפו משימה מהירה ולחצו Enter…"
          aria-label="משימה מהירה"
          maxLength={300}
        />
        {title.trim() && (
          <button type="submit" className="btn btn-primary btn-sm">
            הוספה
          </button>
        )}
      </form>

      {groups.length === 0 && done.length === 0 && (
        <EmptyState icon={<ListChecks size={28} />} title="אין עדיין משימות במרחב הזה" hint="הוסיפו משימה ראשונה בשורה למעלה או בכפתור ״משימה חדשה״." />
      )}
      {groups.length === 0 && done.length > 0 && (
        <EmptyState icon={<ListChecks size={28} />} title="הכל הושלם!" hint="אין משימות פתוחות במרחב הזה." />
      )}

      {groups.map((g) => (
        <section key={g.value} className="tgroup" style={{ ["--c" as string]: g.color }}>
          <header className="tgroup-head">
            <i />
            <h3>{g.label}</h3>
            <span className="count">{g.tasks.length}</span>
          </header>
          <ul className="tlist">
            {g.tasks.map((t) => (
              <Row key={t.id} task={t} today={today} />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="tgroup tgroup-done">
          <button className="tgroup-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <ChevronDown size={16} className={showDone ? "" : "rot"} />
            הושלמו
            <span className="count">{done.length}</span>
          </button>
          {showDone && (
            <ul className="tlist">
              {done.map((t) => (
                <Row key={t.id} task={t} today={today} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
