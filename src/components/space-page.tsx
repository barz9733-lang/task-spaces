"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Pencil, Plus } from "lucide-react";
import { VIEWS } from "@/lib/constants";
import type { ViewType } from "@/lib/types";
import { useApp } from "./app-context";
import { CalendarView } from "./calendar-view";
import { KanbanView } from "./kanban-view";
import { VIEW_ICONS } from "./space-modal";
import { TodoView } from "./todo-view";
import { EmptyState, Segmented } from "./ui";

export function SpacePage({ id }: { id: string }) {
  const { spaces, tasks, today, updateSpace, openTask, openSpaceEditor } = useApp();
  const space = spaces.find((s) => s.id === id);
  const spaceTasks = useMemo(() => tasks.filter((t) => t.space_id === id), [tasks, id]);

  if (!space) {
    return (
      <div className="page">
        <EmptyState
          icon={<Plus size={28} />}
          title="המרחב לא נמצא"
          hint="יכול להיות שהוא נמחק."
          action={
            <Link className="btn btn-primary" href="/">
              חזרה לדשבורד
            </Link>
          }
        />
      </div>
    );
  }

  const open = spaceTasks.filter((t) => t.status !== "done").length;
  const overdue = spaceTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length;

  return (
    <div className="page" style={{ ["--space" as string]: space.color }}>
      <div className="page-head space-head">
        <div className="space-title">
          <i className="space-dot" />
          <div>
            <h1>{space.name}</h1>
            <p className="muted">
              {open} פתוחות
              {overdue > 0 && <span className="bad"> · {overdue} באיחור</span>}
              {" · "}
              {spaceTasks.length - open} הושלמו
            </p>
          </div>
          <button className="icon-btn" onClick={() => openSpaceEditor({ mode: "edit", id })} aria-label="עריכת המרחב">
            <Pencil size={16} />
          </button>
        </div>
        <div className="head-actions">
          <Segmented<ViewType>
            ariaLabel="תצוגה"
            value={space.view}
            onChange={(v) => updateSpace(space.id, { view: v })}
            options={VIEWS.map((v) => {
              const Icon = VIEW_ICONS[v.value];
              return { value: v.value, label: v.label, icon: <Icon size={15} /> };
            })}
          />
          <button className="btn btn-primary" onClick={() => openTask({ draft: { space_id: space.id } })}>
            <Plus size={17} />
            משימה חדשה
          </button>
        </div>
      </div>

      {space.view === "kanban" && <KanbanView space={space} tasks={spaceTasks} />}
      {space.view === "todo" && <TodoView space={space} tasks={spaceTasks} />}
      {space.view === "calendar" && <CalendarView space={space} tasks={spaceTasks} />}
    </div>
  );
}
