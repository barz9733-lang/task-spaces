"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Flame, Plus } from "lucide-react";
import { PRIORITY_BY_VALUE } from "@/lib/constants";
import { formatLong, isoToLocalDate, weekStart } from "@/lib/dates";
import type { Space, Task } from "@/lib/types";
import { useApp } from "./app-context";
import { VIEW_ICONS } from "./space-modal";
import { Checkbox, DuePill, EmptyState, PriorityTag, SpaceChip, byPriorityThenDue } from "./ui";

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 21) return "ערב טוב";
  return "לילה טוב";
}

function DashTask({ task, space, today }: { task: Task; space: Space | undefined; today: string }) {
  const { openTask, updateTask } = useApp();
  const color = PRIORITY_BY_VALUE[task.priority].color;
  return (
    <li className="dtask" style={{ ["--c" as string]: color }} onClick={() => openTask({ id: task.id })}>
      <Checkbox checked={false} color={color} label={`סימון "${task.title}" כהושלמה`} onChange={() => updateTask(task.id, { status: "done" })} />
      <div className="dtask-main">
        <span className="dtask-title">{task.title}</span>
        <div className="dtask-meta">
          <SpaceChip space={space} />
          <PriorityTag priority={task.priority} />
          <DuePill task={task} today={today} compact />
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  icon,
  tone,
  tasks,
  spaceById,
  today,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "urgent" | "today" | "overdue";
  tasks: Task[];
  spaceById: Map<string, Space>;
  today: string;
  emptyText: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.slice(0, 6);
  return (
    <section className={`dsec dsec-${tone}`}>
      <header className="dsec-head">
        <span className="dsec-icon">{icon}</span>
        <h3>{title}</h3>
        <span className="count">{tasks.length}</span>
      </header>
      {tasks.length === 0 ? (
        <p className="dsec-empty">
          <CheckCircle2 size={16} />
          {emptyText}
        </p>
      ) : (
        <ul className="dlist">
          {shown.map((t) => (
            <DashTask key={t.id} task={t} space={spaceById.get(t.space_id)} today={today} />
          ))}
        </ul>
      )}
      {tasks.length > 6 && (
        <button className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? "הצגת פחות" : `הצגת כל ${tasks.length} המשימות`}
        </button>
      )}
    </section>
  );
}

export function Dashboard() {
  const { spaces, tasks, settings, today, setDashboardSpaces, openSpaceEditor } = useApp();
  const [hello, setHello] = useState("שלום");
  useEffect(() => setHello(greeting()), []);

  const allIds = useMemo(() => spaces.map((s) => s.id), [spaces]);
  const selected = useMemo(
    () => new Set(settings.dashboard_spaces ? settings.dashboard_spaces.filter((id) => allIds.includes(id)) : allIds),
    [settings.dashboard_spaces, allIds],
  );
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDashboardSpaces(next.size === allIds.length ? null : allIds.filter((x) => next.has(x)));
  }

  const open = useMemo(() => tasks.filter((t) => selected.has(t.space_id) && t.status !== "done"), [tasks, selected]);
  const urgent = useMemo(() => open.filter((t) => t.priority === "urgent").sort(byPriorityThenDue), [open]);
  const dueToday = useMemo(() => open.filter((t) => t.due_date === today).sort(byPriorityThenDue), [open, today]);
  const overdue = useMemo(() => open.filter((t) => t.due_date && t.due_date < today).sort(byPriorityThenDue), [open, today]);

  const wk = weekStart(today);
  const stats = useMemo(
    () =>
      spaces
        .filter((s) => selected.has(s.id))
        .map((s) => {
          const st = tasks.filter((t) => t.space_id === s.id);
          const openT = st.filter((t) => t.status !== "done");
          return {
            space: s,
            total: st.length,
            open: openT.length,
            overdue: openT.filter((t) => t.due_date && t.due_date < today).length,
            doneWeek: st.filter((t) => t.status === "done" && t.completed_at && isoToLocalDate(t.completed_at) >= wk).length,
          };
        }),
    [spaces, tasks, selected, today, wk],
  );

  if (spaces.length === 0) {
    return (
      <div className="page">
        <EmptyState
          icon={<Plus size={28} />}
          title="עוד אין מרחבים"
          hint="מרחב הוא קבוצה של משימות, למשל בית, עבודה או לימודים. צרו את הראשון כדי להתחיל."
          action={
            <button className="btn btn-primary" onClick={() => openSpaceEditor({ mode: "new" })}>
              <Plus size={16} />
              מרחב חדש
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{hello} 👋</h1>
          <p className="muted">{formatLong(today)}</p>
        </div>
      </div>

      <div className="picker" role="group" aria-label="בחירת מרחבים להצגה בדשבורד">
        <span className="picker-label">מציג מרחבים:</span>
        {spaces.map((s) => (
          <button
            key={s.id}
            className={`pick ${selected.has(s.id) ? "is-on" : ""}`}
            style={{ ["--c" as string]: s.color }}
            aria-pressed={selected.has(s.id)}
            onClick={() => toggle(s.id)}
          >
            <i />
            {s.name}
          </button>
        ))}
        {selected.size < allIds.length && (
          <button className="link-btn" onClick={() => setDashboardSpaces(null)}>
            הצגת הכל
          </button>
        )}
      </div>

      {selected.size === 0 ? (
        <EmptyState icon={<CalendarClock size={28} />} title="לא נבחרו מרחבים" hint="בחרו לפחות מרחב אחד למעלה כדי לראות את המשימות החשובות שלכם." />
      ) : (
        <>
          <div className="dgrid">
            <Section title="דחוף" icon={<Flame size={18} />} tone="urgent" tasks={urgent} spaceById={spaceById} today={today} emptyText="אין משימות דחופות" />
            <Section title="להיום" icon={<CalendarClock size={18} />} tone="today" tasks={dueToday} spaceById={spaceById} today={today} emptyText="אין משימות להיום" />
            <Section title="באיחור" icon={<AlertTriangle size={18} />} tone="overdue" tasks={overdue} spaceById={spaceById} today={today} emptyText="אין משימות באיחור" />
          </div>

          <h2 className="section-title">המרחבים שלי</h2>
          <div className="sgrid">
            {stats.map(({ space, total, open: o, overdue: od, doneWeek }) => {
              const Icon = VIEW_ICONS[space.view];
              const pct = total ? Math.round(((total - o) / total) * 100) : 0;
              return (
                <Link key={space.id} href={`/spaces/${space.id}`} className="scard" style={{ ["--c" as string]: space.color }}>
                  <div className="scard-top">
                    <i className="scard-dot" />
                    <h3>{space.name}</h3>
                    <Icon size={16} className="scard-view" />
                  </div>
                  <div className="scard-stats">
                    <div>
                      <b>{o}</b>
                      <span>פתוחות</span>
                    </div>
                    <div className={od > 0 ? "is-bad" : ""}>
                      <b>{od}</b>
                      <span>באיחור</span>
                    </div>
                    <div className={doneWeek > 0 ? "is-good" : ""}>
                      <b>{doneWeek}</b>
                      <span>נסגרו השבוע</span>
                    </div>
                  </div>
                  <div className="scard-bar" aria-label={`${pct}% הושלמו`}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
