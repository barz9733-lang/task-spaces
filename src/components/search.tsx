"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, RotateCcw, Search } from "lucide-react";
import { PRIORITIES } from "@/lib/constants";
import type { Priority, Task } from "@/lib/types";
import { useApp } from "./app-context";
import { DuePill, Modal, PriorityTag, SpaceChip, StatusTag, byPriorityThenDue } from "./ui";

const MAX_RESULTS = 40;

function matches(t: Task, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = `${t.title} ${t.description} ${t.subtasks.map((s) => s.text).join(" ")}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function SearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="חיפוש משימות" title="חיפוש (Ctrl+K)">
        <Search size={18} />
      </button>
      {open && <SearchModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const { tasks, spaces, today, archivedCount, openTask, refresh, toast } = useApp();
  const [q, setQ] = useState("");
  const [priorities, setPriorities] = useState<Set<Priority>>(new Set());
  const [includeDone, setIncludeDone] = useState(false);
  const [archive, setArchive] = useState<Task[] | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const words = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const filtering = words.length > 0 || priorities.size > 0;

  const results = useMemo(() => {
    if (!filtering) return [];
    return tasks
      .filter((t) => (includeDone || t.status !== "done") && (priorities.size === 0 || priorities.has(t.priority)) && matches(t, words))
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || byPriorityThenDue(a, b));
  }, [tasks, words, priorities, includeDone, filtering]);

  const archived = useMemo(() => {
    if (!archive) return [];
    return archive.filter((t) => (priorities.size === 0 || priorities.has(t.priority)) && matches(t, words));
  }, [archive, words, priorities]);

  const loadArchive = useCallback(async () => {
    setLoadingArchive(true);
    try {
      const res = await fetch("/api/archive", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setArchive(((await res.json()) as { tasks: Task[] }).tasks);
    } catch {
      toast("לא הצלחתי לטעון את הארכיון", "error");
    } finally {
      setLoadingArchive(false);
    }
  }, [toast]);

  async function restore(t: Task) {
    setRestoring(t.id);
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "new" }),
      });
      if (!res.ok) throw new Error();
      setArchive((list) => (list ? list.filter((x) => x.id !== t.id) : list));
      await refresh();
      toast("המשימה הוחזרה לרשימה כמשימה חדשה");
    } catch {
      toast("השחזור נכשל", "error");
    } finally {
      setRestoring(null);
    }
  }

  function toggle(p: Priority) {
    setPriorities((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }

  return (
    <Modal title="חיפוש משימות" onClose={onClose} wide>
      <div className="search">
        <div className="input-icon">
          <Search size={16} />
          <input
            ref={inputRef}
            className="input input-lg"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חפשו לפי כותרת, תיאור או תת-משימה…"
            aria-label="חיפוש"
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                onClose();
                openTask({ id: results[0].id });
              }
            }}
          />
        </div>

        <div className="search-filters" role="group" aria-label="סינון">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`chip ${priorities.has(p.value) ? "is-active" : ""}`}
              aria-pressed={priorities.has(p.value)}
              onClick={() => toggle(p.value)}
            >
              {p.label}
            </button>
          ))}
          <button type="button" className={`chip ${includeDone ? "is-active" : ""}`} aria-pressed={includeDone} onClick={() => setIncludeDone((v) => !v)}>
            כולל הושלמו
          </button>
        </div>

        {!filtering && !archive && <p className="muted search-hint">הקלידו מילה, או בחרו עדיפות, כדי לחפש בכל המרחבים.</p>}

        {filtering && (
          <>
            <div className="search-count muted">
              {results.length === 0 ? "לא נמצאו משימות פעילות" : results.length === 1 ? "משימה אחת" : `${results.length} משימות`}
              {results.length > MAX_RESULTS && ` (מוצגות ${MAX_RESULTS} הראשונות)`}
            </div>
            <ul className="search-results">
              {results.slice(0, MAX_RESULTS).map((t) => (
                <li
                  key={t.id}
                  className={t.status === "done" ? "is-done" : ""}
                  onClick={() => {
                    onClose();
                    openTask({ id: t.id });
                  }}
                >
                  <span className="sres-title">{t.title}</span>
                  <span className="sres-meta">
                    <SpaceChip space={spaceById.get(t.space_id)} />
                    <PriorityTag priority={t.priority} />
                    {t.status !== "new" && <StatusTag status={t.status} />}
                    <DuePill task={t} today={today} compact />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {archive ? (
          <>
            <div className="search-count muted">
              <Archive size={14} /> ארכיון: {archived.length} משימות שהושלמו לפני יותר מחודש
            </div>
            <ul className="search-results">
              {archived.slice(0, MAX_RESULTS).map((t) => (
                <li key={t.id} className="is-archived">
                  <span className="sres-title">{t.title}</span>
                  <span className="sres-meta">
                    <SpaceChip space={spaceById.get(t.space_id)} />
                    {t.completed_at && <span className="due">הושלמה {t.completed_at.slice(0, 10).split("-").reverse().join("/")}</span>}
                    <button className="btn btn-outline btn-sm" disabled={restoring === t.id} onClick={() => restore(t)}>
                      <RotateCcw size={13} />
                      שחזור
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          archivedCount > 0 && (
            <button className="link-btn search-archive" onClick={loadArchive} disabled={loadingArchive}>
              <Archive size={14} />
              {loadingArchive ? "טוען…" : `חיפוש גם בארכיון (${archivedCount} משימות ישנות שהושלמו)`}
            </button>
          )
        )}
      </div>
    </Modal>
  );
}
