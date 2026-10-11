"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, Check, ListChecks, Repeat, X } from "lucide-react";
import { PRIORITY_BY_VALUE, STATUS_BY_VALUE } from "@/lib/constants";
import { diffDays, relativeLabel } from "@/lib/dates";
import type { Priority, Space, Status, Task } from "@/lib/types";

const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;

export function PriorityTag({ priority }: { priority: Priority }) {
  const p = PRIORITY_BY_VALUE[priority];
  return (
    <span className="tag" style={cssVar("--c", p.color)}>
      <i className="tag-dot" />
      {p.label}
    </span>
  );
}

export function StatusTag({ status }: { status: Status }) {
  const s = STATUS_BY_VALUE[status];
  return (
    <span className="tag tag-status" style={cssVar("--c", s.color)}>
      {s.label}
    </span>
  );
}

export function DuePill({ task, today, compact }: { task: Pick<Task, "due_date" | "status">; today: string; compact?: boolean }) {
  if (!task.due_date) return null;
  const diff = diffDays(task.due_date, today);
  const done = task.status === "done";
  const cls = done ? "" : diff < 0 ? "due-overdue" : diff === 0 ? "due-today" : "";
  return (
    <span className={`due ${cls}`}>
      <CalendarDays size={compact ? 12 : 13} />
      {relativeLabel(task.due_date, today)}
    </span>
  );
}

export function SpaceChip({ space }: { space: Pick<Space, "name" | "color"> | undefined }) {
  if (!space) return null;
  return (
    <span className="space-chip" style={cssVar("--c", space.color)}>
      <i />
      {space.name}
    </span>
  );
}

export function Checkbox({
  checked,
  color,
  onChange,
  label,
}: {
  checked: boolean;
  color?: string;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check ${checked ? "is-checked" : ""}`}
      style={color ? cssVar("--c", color) : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <Check size={13} strokeWidth={3.2} />
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; color?: string; icon?: ReactNode }[];
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "is-active" : ""}
          style={o.color ? cssVar("--c", o.color) : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.color && <i className="seg-dot" />}
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

/** Sort used everywhere: urgent first, then closest due date */
export function byPriorityThenDue(a: Task, b: Task): number {
  return (
    PRIORITY_BY_VALUE[b.priority].rank - PRIORITY_BY_VALUE[a.priority].rank ||
    (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99") ||
    a.created_at.localeCompare(b.created_at)
  );
}

/** Small badges: repeats / subtasks progress */
export function TaskBadges({ task }: { task: Pick<Task, "recurrence" | "subtasks"> }) {
  const subs = task.subtasks ?? [];
  if (!task.recurrence && subs.length === 0) return null;
  const done = subs.filter((s) => s.done).length;
  return (
    <>
      {subs.length > 0 && (
        <span className="tbadge" title="תת-משימות">
          <ListChecks size={12} />
          {done}/{subs.length}
        </span>
      )}
      {task.recurrence && (
        <span className="tbadge" title="משימה חוזרת">
          <Repeat size={12} />
        </span>
      )}
    </>
  );
}
