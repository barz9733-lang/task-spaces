"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { PRIORITIES, RECURRENCES, STATUSES } from "@/lib/constants";
import { addDays } from "@/lib/dates";
import type { Priority, Recurrence, Status, Subtask, Task } from "@/lib/types";
import { useApp } from "./app-context";
import { Checkbox, Modal, Segmented } from "./ui";

export function TaskModal() {
  const { taskEditor, closeTask, tasks, spaces, today, createTask, updateTask, deleteTask } = useApp();
  if (!taskEditor) return null;
  const existing = "id" in taskEditor ? tasks.find((t) => t.id === taskEditor.id) : undefined;
  if ("id" in taskEditor && !existing) return null; // deleted meanwhile
  return (
    <TaskForm
      key={existing?.id ?? "new"}
      existing={existing}
      draft={"draft" in taskEditor ? taskEditor.draft : undefined}
      {...{ closeTask, spaces, today, createTask, updateTask, deleteTask }}
    />
  );
}

type Props = {
  existing?: Task;
  draft?: Partial<Task>;
  closeTask: () => void;
  spaces: ReturnType<typeof useApp>["spaces"];
  today: string;
  createTask: ReturnType<typeof useApp>["createTask"];
  updateTask: ReturnType<typeof useApp>["updateTask"];
  deleteTask: ReturnType<typeof useApp>["deleteTask"];
};

function TaskForm({ existing, draft, closeTask, spaces, today, createTask, updateTask, deleteTask }: Props) {
  const init = existing ?? draft ?? {};
  const [title, setTitle] = useState(init.title ?? "");
  const [description, setDescription] = useState(init.description ?? "");
  const [priority, setPriority] = useState<Priority>(init.priority ?? "medium");
  const [status, setStatus] = useState<Status>(init.status ?? "new");
  const [due, setDue] = useState<string>(init.due_date ?? "");
  const [spaceId, setSpaceId] = useState<string>(init.space_id ?? spaces[0]?.id ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence | "none">(init.recurrence ?? "none");
  const [subtasks, setSubtasks] = useState<Subtask[]>(init.subtasks ?? []);
  const [newSub, setNewSub] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const space = useMemo(() => spaces.find((s) => s.id === spaceId), [spaces, spaceId]);

  async function save() {
    if (!title.trim()) {
      setError("צריך לתת למשימה כותרת");
      titleRef.current?.focus();
      return;
    }
    if (!spaceId) {
      setError("צריך לבחור מרחב");
      return;
    }
    if (recurrence !== "none" && !due) {
      setError("משימה חוזרת צריכה תאריך יעד");
      return;
    }
    const pendingSub = newSub.trim();
    const finalSubs = pendingSub ? [...subtasks, { id: crypto.randomUUID(), text: pendingSub, done: false }] : subtasks;
    setSaving(true);
    const payload = {
      title: title.trim(),
      description,
      priority,
      status,
      due_date: due || null,
      space_id: spaceId,
      recurrence: recurrence === "none" ? null : recurrence,
      subtasks: finalSubs,
    };
    if (existing) {
      await updateTask(existing.id, payload);
      closeTask();
    } else {
      const t = await createTask(payload);
      if (t) closeTask();
      else setSaving(false);
    }
  }

  const quick = [
    { label: "היום", value: today },
    { label: "מחר", value: addDays(today, 1) },
    { label: "בעוד שבוע", value: addDays(today, 7) },
  ];

  return (
    <Modal
      title={existing ? "עריכת משימה" : "משימה חדשה"}
      onClose={closeTask}
      footer={
        <>
          {existing &&
            (confirmDelete ? (
              <div className="confirm-inline">
                <span>למחוק את המשימה?</span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    await deleteTask(existing.id);
                    closeTask();
                  }}
                >
                  כן, למחוק
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                  ביטול
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
                מחיקה
              </button>
            ))}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={closeTask}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {existing ? "שמירה" : "יצירת משימה"}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
      >
        <label className="field">
          <span>כותרת</span>
          <input
            ref={titleRef}
            className="input input-lg"
            value={title}
            maxLength={300}
            placeholder="מה צריך לעשות?"
            onChange={(e) => {
              setTitle(e.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}

        <div className="field">
          <span>עדיפות</span>
          <Segmented
            ariaLabel="עדיפות"
            value={priority}
            onChange={setPriority}
            options={[...PRIORITIES].reverse().map((p) => ({ value: p.value, label: p.label, color: p.color }))}
          />
        </div>

        <div className="field">
          <span>סטטוס</span>
          <Segmented
            ariaLabel="סטטוס"
            value={status}
            onChange={setStatus}
            options={STATUSES.map((s) => ({ value: s.value, label: s.label, color: s.color }))}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <span>תאריך יעד</span>
            <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
            <div className="quick-dates">
              {quick.map((q) => (
                <button type="button" key={q.label} className={`chip ${due === q.value ? "is-active" : ""}`} onClick={() => setDue(q.value)}>
                  {q.label}
                </button>
              ))}
              {due && (
                <button type="button" className="chip" onClick={() => setDue("")}>
                  ללא תאריך
                </button>
              )}
            </div>
          </div>
          <label className="field">
            <span>מרחב</span>
            <div className="select-wrap" style={{ ["--c" as string]: space?.color }}>
              <i className="select-dot" />
              <select className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="field">
          <span>חזרה</span>
          <Segmented<Recurrence | "none">
            ariaLabel="חזרה"
            value={recurrence}
            onChange={(v) => {
              setRecurrence(v);
              setError("");
            }}
            options={[{ value: "none", label: "ללא" }, ...RECURRENCES.map((r) => ({ value: r.value, label: r.label }))]}
          />
          {recurrence !== "none" && <small className="muted">כשתסמנו את המשימה כהושלמה תיווצר אוטומטית המשימה הבאה.</small>}
        </div>

        <div className="field">
          <span>
            תת-משימות
            {subtasks.length > 0 && ` (${subtasks.filter((s) => s.done).length}/${subtasks.length})`}
          </span>
          <ul className="subtasks">
            {subtasks.map((s) => (
              <li key={s.id} className={s.done ? "is-done" : ""}>
                <Checkbox
                  checked={s.done}
                  label={`סימון "${s.text}"`}
                  onChange={(v) => setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, done: v } : x)))}
                />
                <span>{s.text}</span>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label="הסרת תת-משימה"
                  onClick={() => setSubtasks((list) => list.filter((x) => x.id !== s.id))}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="subtask-add">
            <input
              className="input"
              value={newSub}
              maxLength={200}
              placeholder="הוסיפו שלב ולחצו Enter"
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  const text = newSub.trim();
                  if (text && subtasks.length < 50) {
                    setSubtasks((list) => [...list, { id: crypto.randomUUID(), text, done: false }]);
                    setNewSub("");
                  }
                }
              }}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!newSub.trim()}
              onClick={() => {
                const text = newSub.trim();
                if (text) {
                  setSubtasks((list) => [...list, { id: crypto.randomUUID(), text, done: false }]);
                  setNewSub("");
                }
              }}
            >
              <Plus size={14} />
              הוספה
            </button>
          </div>
        </div>

        <label className="field">
          <span>תיאור</span>
          <textarea
            className="input"
            rows={3}
            value={description}
            placeholder="פרטים נוספים (לא חובה)"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </form>
    </Modal>
  );
}
