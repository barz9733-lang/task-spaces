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
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PRIORITY_BY_VALUE } from "@/lib/constants";
import { addMonths, formatLong, monthGrid, monthTitle, weekdayShort } from "@/lib/dates";
import type { Space, Task } from "@/lib/types";
import { useApp } from "./app-context";
import { Modal, PriorityTag, StatusTag, byPriorityThenDue, useMediaQuery } from "./ui";

function Chip({ task, overlay, onOpen }: { task: Task; overlay?: boolean; onOpen?: () => void }) {
  const p = PRIORITY_BY_VALUE[task.priority];
  return (
    <div
      className={`cchip ${task.status === "done" ? "is-done" : ""} ${overlay ? "is-overlay" : ""}`}
      style={{ ["--c" as string]: p.color }}
      title={`${task.title} · ${p.label}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
    >
      <span>{task.title}</span>
    </div>
  );
}

function DraggableChip({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`cchip-wrap ${isDragging ? "is-dragging" : ""}`}>
      <Chip task={task} onOpen={onOpen} />
    </div>
  );
}

function DayCell({
  iso,
  inMonth,
  isToday,
  weekend,
  tasks,
  maxChips,
  onAdd,
  onOpenTask,
  onMore,
}: {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  weekend: boolean;
  tasks: Task[];
  maxChips: number;
  onAdd: () => void;
  onOpenTask: (t: Task) => void;
  onMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const shown = tasks.slice(0, tasks.length > maxChips ? maxChips - 1 : maxChips);
  const hidden = tasks.length - shown.length;
  const day = Number(iso.slice(8));
  return (
    <div
      ref={setNodeRef}
      className={`cday ${inMonth ? "" : "is-out"} ${isToday ? "is-today" : ""} ${weekend ? "is-weekend" : ""} ${isOver ? "is-over" : ""}`}
      onClick={onAdd}
      role="button"
      tabIndex={0}
      aria-label={`הוספת משימה ב-${formatLong(iso)}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onAdd();
      }}
    >
      <div className="cday-num">
        <span>{day === 1 ? `${day} ${monthTitle(iso).split(" ")[0]}` : day}</span>
        <button
          className="cday-add"
          tabIndex={-1}
          aria-hidden
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="cday-tasks">
        {shown.map((t) => (
          <DraggableChip key={t.id} task={t} onOpen={() => onOpenTask(t)} />
        ))}
        {hidden > 0 && (
          <button
            className="cmore"
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
          >
            עוד {hidden}
          </button>
        )}
      </div>
    </div>
  );
}

export function CalendarView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, updateTask, openTask } = useApp();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const small = useMediaQuery("(max-width: 720px)");
  const maxChips = small ? 2 : 3;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || byPriorityThenDue(a, b));
    return m;
  }, [tasks]);

  const undated = useMemo(() => tasks.filter((t) => !t.due_date && t.status !== "done").sort(byPriorityThenDue), [tasks]);

  const days = useMemo(() => {
    const g = monthGrid(month);
    return g[35].slice(0, 7) === month.slice(0, 7) ? g : g.slice(0, 35);
  }, [month]);

  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    const t = tasks.find((x) => x.id === id);
    if (t && target && /^\d{4}-\d{2}-\d{2}$/.test(target) && t.due_date !== target) updateTask(id, { due_date: target });
  }

  const addOn = (iso: string) => openTask({ draft: { space_id: space.id, due_date: iso } });
  const monthTasks = days.reduce((n, d) => n + (byDate.get(d)?.length ?? 0), 0);
  const isCurrentMonth = month.slice(0, 7) === today.slice(0, 7);

  return (
    <DndContext
      id="calendar-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="cal">
        <div className="cal-bar">
          <h2 className="cal-title">{monthTitle(month)}</h2>
          <div className="cal-nav">
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="החודש הקודם">
              <ChevronRight size={20} />
            </button>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="החודש הבא">
              <ChevronLeft size={20} />
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setMonth(today.slice(0, 7) + "-01")} disabled={isCurrentMonth}>
              היום
            </button>
          </div>
          <span className="muted cal-count">{monthTasks} משימות בתצוגה</span>
        </div>

        <div className="cal-grid-wrap">
          <div className="cal-head" aria-hidden>
            {weekdayShort.map((d, i) => (
              <div key={d} className={i >= 5 ? "is-weekend" : ""}>
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid" style={{ ["--rows" as string]: days.length / 7 }}>
            {days.map((iso, i) => (
              <DayCell
                key={iso}
                iso={iso}
                inMonth={iso.slice(0, 7) === month.slice(0, 7)}
                isToday={iso === today}
                weekend={i % 7 >= 5}
                tasks={byDate.get(iso) ?? []}
                maxChips={maxChips}
                onAdd={() => addOn(iso)}
                onOpenTask={(t) => openTask({ id: t.id })}
                onMore={() => setDayModal(iso)}
              />
            ))}
          </div>
        </div>

        {undated.length > 0 && (
          <div className="undated">
            <div className="undated-head">
              <strong>ללא תאריך יעד</strong>
              <span className="count">{undated.length}</span>
              <small className="muted">גררו משימה ליום בלוח כדי לתזמן אותה</small>
            </div>
            <div className="undated-list">
              {undated.map((t) => (
                <DraggableChip key={t.id} task={t} onOpen={() => openTask({ id: t.id })} />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <Chip task={active} overlay /> : null}</DragOverlay>

      {dayModal && (
        <Modal
          title={formatLong(dayModal)}
          onClose={() => setDayModal(null)}
          footer={
            <>
              <span className="spacer" />
              <button
                className="btn btn-primary"
                onClick={() => {
                  const d = dayModal;
                  setDayModal(null);
                  addOn(d);
                }}
              >
                <Plus size={16} />
                משימה ביום הזה
              </button>
            </>
          }
        >
          <ul className="day-list">
            {(byDate.get(dayModal) ?? []).map((t) => (
              <li
                key={t.id}
                className={t.status === "done" ? "is-done" : ""}
                onClick={() => {
                  setDayModal(null);
                  openTask({ id: t.id });
                }}
              >
                <span>{t.title}</span>
                <PriorityTag priority={t.priority} />
                <StatusTag status={t.status} />
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </DndContext>
  );
}
