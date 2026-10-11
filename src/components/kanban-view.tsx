"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlignRight, Plus } from "lucide-react";
import { PRIORITY_BY_VALUE, STATUSES } from "@/lib/constants";
import type { Space, Status, Task } from "@/lib/types";
import { useApp } from "./app-context";
import { DuePill, PriorityTag, TaskBadges, byPriorityThenDue } from "./ui";

function TaskCard({ task, today, onOpen, overlay }: { task: Task; today: string; onOpen?: () => void; overlay?: boolean }) {
  const p = PRIORITY_BY_VALUE[task.priority];
  return (
    <div
      className={`kcard ${task.status === "done" ? "is-done" : ""} ${overlay ? "is-overlay" : ""}`}
      style={{ ["--c" as string]: p.color }}
      onClick={onOpen}
    >
      <div className="kcard-title">{task.title}</div>
      {task.description && (
        <div className="kcard-desc">
          <AlignRight size={12} />
          <span>{task.description}</span>
        </div>
      )}
      <div className="kcard-meta">
        <PriorityTag priority={task.priority} />
        <DuePill task={task} today={today} />
        <TaskBadges task={task} />
      </div>
    </div>
  );
}

function DraggableCard({ task, today, onOpen }: { task: Task; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`kcard-wrap ${isDragging ? "is-dragging" : ""}`}>
      <TaskCard task={task} today={today} onOpen={onOpen} />
    </div>
  );
}

function Column({
  status,
  label,
  color,
  tasks,
  today,
  onOpen,
  onAdd,
}: {
  status: Status;
  label: string;
  color: string;
  tasks: Task[];
  today: string;
  onOpen: (t: Task) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className={`kcol ${isOver ? "is-over" : ""}`} style={{ ["--c" as string]: color }} aria-label={label}>
      <header className="kcol-head">
        <i className="kcol-dot" />
        <h3>{label}</h3>
        <span className="count">{tasks.length}</span>
        <button className="icon-btn icon-btn-sm" onClick={onAdd} aria-label={`משימה חדשה ב${label}`}>
          <Plus size={16} />
        </button>
      </header>
      <div ref={setNodeRef} className="kcol-body">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} today={today} onOpen={() => onOpen(t)} />
        ))}
        {tasks.length === 0 && <div className="kcol-empty">גררו לכאן משימה</div>}
      </div>
    </section>
  );
}

export function KanbanView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, updateTask, openTask } = useApp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const columns = useMemo(
    () =>
      STATUSES.map((s) => ({
        ...s,
        tasks: tasks
          .filter((t) => t.status === s.value)
          .sort(s.value === "done" ? (a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "") : byPriorityThenDue),
      })),
    [tasks],
  );

  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as Status | undefined;
    const task = tasks.find((t) => t.id === id);
    if (task && to && task.status !== to) updateTask(id, { status: to });
  }

  return (
    <DndContext
      id="kanban-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="kanban">
        {columns.map((c) => (
          <Column
            key={c.value}
            status={c.value}
            label={c.label}
            color={c.color}
            tasks={c.tasks}
            today={today}
            onOpen={(t) => openTask({ id: t.id })}
            onAdd={() => openTask({ draft: { space_id: space.id, status: c.value } })}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>{active ? <TaskCard task={active} today={today} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
