"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Columns3, ListTodo, Trash2 } from "lucide-react";
import { SPACE_COLORS, VIEWS } from "@/lib/constants";
import type { Space, ViewType } from "@/lib/types";
import { useApp } from "./app-context";
import { Modal } from "./ui";

export const VIEW_ICONS: Record<ViewType, typeof Columns3> = {
  kanban: Columns3,
  todo: ListTodo,
  calendar: CalendarDays,
};

export function SpaceModal() {
  const { spaceEditor, spaces, closeSpaceEditor } = useApp();
  if (!spaceEditor) return null;
  const existing = spaceEditor.mode === "edit" ? spaces.find((s) => s.id === spaceEditor.id) : undefined;
  if (spaceEditor.mode === "edit" && !existing) return null;
  return <SpaceForm key={existing?.id ?? "new"} existing={existing} onClose={closeSpaceEditor} />;
}

function SpaceForm({ existing, onClose }: { existing?: Space; onClose: () => void }) {
  const { spaces, createSpace, updateSpace, deleteSpace, tasks } = useApp();
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? SPACE_COLORS[spaces.length % SPACE_COLORS.length]);
  const [view, setView] = useState<ViewType>(existing?.view ?? "kanban");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError("צריך לתת למרחב שם");
      return;
    }
    setSaving(true);
    if (existing) {
      await updateSpace(existing.id, { name: name.trim(), color, view });
      onClose();
    } else {
      const s = await createSpace({ name: name.trim(), color, view });
      if (s) {
        onClose();
        router.push(`/spaces/${s.id}`);
      } else setSaving(false);
    }
  }

  const count = existing ? tasks.filter((t) => t.space_id === existing.id).length : 0;

  return (
    <Modal
      title={existing ? "עריכת מרחב" : "מרחב חדש"}
      onClose={onClose}
      footer={
        <>
          {existing &&
            (confirmDelete ? (
              <div className="confirm-inline">
                <span>
                  למחוק את המרחב{count ? ` ו-${count} המשימות שבו` : ""}?
                </span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    if (await deleteSpace(existing.id)) {
                      onClose();
                      router.push("/");
                    }
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
                מחיקת מרחב
              </button>
            ))}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {existing ? "שמירה" : "יצירת מרחב"}
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
      >
        <label className="field">
          <span>שם המרחב</span>
          <input
            autoFocus
            className="input input-lg"
            value={name}
            maxLength={60}
            placeholder="למשל: בית, עבודה, לימודים"
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}

        <div className="field">
          <span>צבע</span>
          <div className="swatches" role="radiogroup" aria-label="צבע המרחב">
            {SPACE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                className={`swatch ${color === c ? "is-active" : ""}`}
                style={{ ["--c" as string]: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span>תצוגה</span>
          <div className="view-cards" role="radiogroup" aria-label="תצוגת המרחב">
            {VIEWS.map((v) => {
              const Icon = VIEW_ICONS[v.value];
              return (
                <button
                  type="button"
                  key={v.value}
                  role="radio"
                  aria-checked={view === v.value}
                  className={`view-card ${view === v.value ? "is-active" : ""}`}
                  style={{ ["--c" as string]: color }}
                  onClick={() => setView(v.value)}
                >
                  <Icon size={22} />
                  <strong>{v.label}</strong>
                  <small>{v.hint}</small>
                </button>
              );
            })}
          </div>
          {existing && <small className="muted">אפשר להחליף תצוגה בכל רגע, גם מתוך המרחב עצמו.</small>}
        </div>
      </form>
    </Modal>
  );
}
