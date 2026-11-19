"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Plus, Repeat } from "lucide-react";
import { PRIORITY_BY_VALUE, RECURRENCES } from "@/lib/constants";
import { relativeLabel } from "@/lib/dates";
import { parseQuickTask } from "@/lib/quick-add";
import type { Space } from "@/lib/types";
import { useApp } from "./app-context";

/**
 * One line that understands "לשלם ארנונה מחר דחוף": shows what it recognised while typing,
 * and creates the task on Enter. With `spaces` it also lets the user pick the space.
 */
export function QuickAdd({ spaceId, spaces }: { spaceId?: string; spaces?: Space[] }) {
  const { today, createTask, toast } = useApp();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string>(spaceId ?? spaces?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const target = spaceId ?? (spaces?.some((s) => s.id === picked) ? picked : spaces?.[0]?.id) ?? "";

  const parsed = useMemo(() => (text.trim() ? parseQuickTask(text, today) : null), [text, today]);

  async function submit() {
    if (!parsed || !target || busy) return;
    setBusy(true);
    const t = await createTask({
      space_id: target,
      title: parsed.title,
      due_date: parsed.due_date,
      priority: parsed.priority ?? undefined,
      recurrence: parsed.recurrence,
    });
    setBusy(false);
    if (t) {
      setText("");
      if (spaces) toast(`נוספה ל"${spaces.find((s) => s.id === target)?.name ?? ""}"`);
    }
  }

  const recLabel = parsed?.recurrence ? RECURRENCES.find((r) => r.value === parsed.recurrence)?.label : null;

  return (
    <div className="qa">
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Plus size={18} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="משימה מהירה, למשל: לשלם ארנונה מחר דחוף"
          aria-label="משימה מהירה"
          maxLength={300}
        />
        {spaces && spaces.length > 1 && (
          <select className="qa-space" value={target} onChange={(e) => setPicked(e.target.value)} aria-label="מרחב">
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {text.trim() && (
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            הוספה
          </button>
        )}
      </form>
      {parsed && (parsed.due_date || parsed.priority || parsed.recurrence) && (
        <div className="qa-preview" aria-live="polite">
          <span className="qa-title">{parsed.title}</span>
          {parsed.due_date && (
            <span className="qa-tag">
              <CalendarDays size={12} />
              {relativeLabel(parsed.due_date, today)}
            </span>
          )}
          {parsed.priority && (
            <span className="qa-tag" style={{ ["--c" as string]: PRIORITY_BY_VALUE[parsed.priority].color }}>
              <i className="qa-dot" />
              {PRIORITY_BY_VALUE[parsed.priority].label}
            </span>
          )}
          {recLabel && (
            <span className="qa-tag">
              <Repeat size={12} />
              {recLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
