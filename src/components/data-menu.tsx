"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Download, FileJson, FileSpreadsheet, RotateCcw, Trash2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { useApp } from "./app-context";
import { Modal } from "./ui";

type Trashed = Task & { deleted_at: string };

const shortDate = (ts: string) => ts.slice(0, 10).split("-").reverse().join("/");

export function DataButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="הנתונים שלי" title="גיבוי, ייצוא וסל מחזור">
        <Database size={18} />
      </button>
      {open && <DataModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DataModal({ onClose }: { onClose: () => void }) {
  const { tasks, spaces, archivedCount, refresh, toast } = useApp();
  const [trash, setTrash] = useState<Trashed[] | null>(null);
  const [keepDays, setKeepDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const spaceName = useMemo(() => new Map(spaces.map((s) => [s.id, s.name])), [spaces]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trash", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tasks: Trashed[]; keep_days: number };
      setTrash(data.tasks);
      setKeepDays(data.keep_days);
    } catch {
      setTrash([]);
      toast("לא הצלחתי לטעון את סל המחזור", "error");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "restore" | "purge", ids?: string[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      if (!res.ok) throw new Error();
      await load();
      if (action === "restore") {
        await refresh();
        toast("המשימה שוחזרה");
      }
    } catch {
      toast("הפעולה נכשלה", "error");
    } finally {
      setBusy(false);
      setConfirmEmpty(false);
      setConfirmId(null);
    }
  }

  return (
    <Modal title="הנתונים שלי" onClose={onClose}>
      <div className="data-menu">
        <section>
          <h3>
            <Download size={16} />
            גיבוי וייצוא
          </h3>
          <p className="muted">
            הורדת כל המרחבים והמשימות לקובץ: {spaces.length} מרחבים, {tasks.length + archivedCount} משימות
            {archivedCount > 0 && ` (מתוכן ${archivedCount} בארכיון)`}. כדאי להוריד גיבוי מדי פעם.
          </p>
          <div className="data-actions">
            <a className="btn btn-primary" href="/api/export?format=json" download>
              <FileJson size={16} />
              גיבוי מלא (JSON)
            </a>
            <a className="btn btn-outline" href="/api/export?format=csv" download>
              <FileSpreadsheet size={16} />
              טבלה לאקסל (CSV)
            </a>
          </div>
        </section>

        <section>
          <h3>
            <Trash2 size={16} />
            סל מחזור
            {trash && trash.length > 0 && <span className="count">{trash.length}</span>}
          </h3>
          <p className="muted">משימות שנמחקו נשמרות כאן {keepDays} יום, ואז נמחקות לצמיתות.</p>
          {trash === null ? (
            <p className="muted">טוען…</p>
          ) : trash.length === 0 ? (
            <p className="muted">הסל ריק.</p>
          ) : (
            <>
              <ul className="trash-list">
                {trash.map((t) => (
                  <li key={t.id}>
                    <div className="tl-main">
                      <b>{t.title}</b>
                      <small>
                        {spaceName.get(t.space_id) ?? ""} · נמחקה {shortDate(t.deleted_at)}
                      </small>
                    </div>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => act("restore", [t.id])}>
                      <RotateCcw size={13} />
                      שחזור
                    </button>
                    {confirmId === t.id ? (
                      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => act("purge", [t.id])}>
                        למחוק לצמיתות
                      </button>
                    ) : (
                      <button
                        className="icon-btn icon-btn-sm"
                        disabled={busy}
                        onClick={() => setConfirmId(t.id)}
                        aria-label={`מחיקה לצמיתות של "${t.title}"`}
                        title="מחיקה לצמיתות"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {confirmEmpty ? (
                <div className="confirm-inline">
                  <span>למחוק לצמיתות את כל {trash.length} המשימות שבסל? אי אפשר לבטל.</span>
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => act("purge")}>
                    כן, לרוקן
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEmpty(false)}>
                    ביטול
                  </button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-danger-text btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmEmpty(true)}>
                  ריקון הסל
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
