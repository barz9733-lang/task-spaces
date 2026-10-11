"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bot, Check, ChevronDown, Layers, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import type { AgentScope, ChatTurn } from "@/lib/types";
import { useApp } from "./app-context";

type Msg =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string; error?: boolean }
  | { id: number; kind: "note"; text: string }
  | {
      id: number;
      kind: "confirm";
      pendingId: string;
      summary: string;
      count: number;
      items: string[];
      actionKind: string;
      state: "waiting" | "busy" | "approved" | "rejected" | "failed";
    };

type StreamEvent =
  | { type: "status"; text: string }
  | { type: "message"; text: string }
  | { type: "confirm"; pendingId: string; kind: string; summary: string; count: number; items: string[]; text?: string }
  | { type: "changed" }
  | { type: "error"; message: string };

/** Tiny safe renderer: **bold**, "- " / "1. " lists and line breaks. */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={`l${out.length}`}>{list.items}</Tag>);
    list = null;
  };
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(<li key={i}>{inline((bullet ?? num)![1])}</li>);
      return;
    }
    flush();
    if (!line.trim()) return;
    out.push(<p key={i}>{inline(line)}</p>);
  });
  flush();
  return <>{out}</>;
}

const SUGGESTIONS_ALL = [
  "מה המשימות הכי חשובות שצריך לתת להן עדיפות?",
  "תדחה את כל מה שבאיחור למחר",
  "תוסיף לבית: לקנות חלב, להתקשר לסבתא מחר, לשלם ארנונה עד ה-10",
  "תסכם לי איפה אני עומד השבוע",
];
const SUGGESTIONS_SPACE = [
  "מה הכי חשוב לעשות במרחב הזה?",
  "תדחה את כל מה שבאיחור למחר",
  "תסכם לי את המצב",
  "תוסיף משימה דחופה: ",
];

export function ChatWidget() {
  const { spaces, refresh } = useApp();
  const pathname = usePathname();
  const routeSpaceId = useMemo(() => pathname.match(/^\/spaces\/([0-9a-f-]{36})/i)?.[1] ?? null, [pathname]);
  const routeScope = useMemo<AgentScope>(
    () => (routeSpaceId && spaces.some((s) => s.id === routeSpaceId) ? { type: "space", spaceId: routeSpaceId } : { type: "all" }),
    [routeSpaceId, spaces],
  );

  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<AgentScope | null>(null);
  const [menu, setMenu] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [unseen, setUnseen] = useState(false);
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRouteKey = useRef(JSON.stringify(routeScope));

  // Entering a space / the dashboard re-selects the matching scope automatically.
  useEffect(() => {
    const key = JSON.stringify(routeScope);
    if (key !== lastRouteKey.current) {
      lastRouteKey.current = key;
      setOverride(null);
    }
  }, [routeScope]);

  const wanted = override ?? routeScope;
  const scope: AgentScope =
    wanted.type === "space" && !spaces.some((s) => s.id === wanted.spaceId) ? { type: "all" } : wanted;
  const scopeSpace = scope.type === "space" ? spaces.find((s) => s.id === scope.spaceId) : undefined;
  const scopeLabel = scopeSpace ? scopeSpace.name : "כל המרחבים";

  const nextId = () => ++idRef.current;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (open) {
      setUnseen(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !menu) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, menu]);

  function changeScope(next: AgentScope) {
    setMenu(false);
    const same = JSON.stringify(next) === JSON.stringify(scope);
    if (same) return;
    setOverride(next);
    const name = next.type === "all" ? "כל המרחבים" : (spaces.find((s) => s.id === next.spaceId)?.name ?? "");
    setMsgs((m) => [...m, { id: nextId(), kind: "note", text: `עברתי לעבוד על: ${name}` }]);
  }

  /** Reads the NDJSON stream and applies events to the message list. */
  const consume = useCallback(
    async (res: Response, onConfirmMsgId?: number) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "השרת לא הגיב כראוי");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handle = (ev: StreamEvent) => {
        switch (ev.type) {
          case "status":
            setStatus(ev.text);
            break;
          case "changed":
            refresh();
            break;
          case "message":
            setMsgs((m) => [...m, { id: nextId(), kind: "assistant", text: ev.text }]);
            break;
          case "error":
            setMsgs((m) => [...m, { id: nextId(), kind: "assistant", text: ev.message, error: true }]);
            break;
          case "confirm":
            setMsgs((m) => [
              ...m,
              ...(ev.text ? [{ id: nextId(), kind: "assistant" as const, text: ev.text }] : []),
              {
                id: nextId(),
                kind: "confirm" as const,
                pendingId: ev.pendingId,
                summary: ev.summary,
                count: ev.count,
                items: ev.items,
                actionKind: ev.kind,
                state: "waiting" as const,
              },
            ]);
            break;
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line) handle(JSON.parse(line) as StreamEvent);
        }
      }
      void onConfirmMsgId;
      await refresh();
    },
    [refresh],
  );

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const history: ChatTurn[] = [
      ...msgs
        .filter((m): m is Extract<Msg, { kind: "user" | "assistant" }> => (m.kind === "user" || m.kind === "assistant") && !("error" in m && m.error))
        .map((m) => ({ role: m.kind, content: m.text }) as ChatTurn),
      { role: "user", content: text },
    ];
    setMsgs((m) => [...m, { id: nextId(), kind: "user", text }]);
    setBusy(true);
    setStatus("חושב…");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20), scope }),
        signal: ac.signal,
      });
      await consume(res);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMsgs((m) => [...m, { id: nextId(), kind: "assistant", text: (e as Error).message || "משהו השתבש. נסו שוב.", error: true }]);
    } finally {
      setBusy(false);
      setStatus("");
      if (!open) setUnseen(true);
    }
  }

  async function decide(id: number, pendingId: string, approve: boolean) {
    setMsgs((m) => m.map((x) => (x.id === id && x.kind === "confirm" ? { ...x, state: "busy" } : x)));
    setBusy(true);
    setStatus(approve ? "מבצע…" : "מבטל…");
    try {
      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, approve }),
      });
      setMsgs((m) => m.map((x) => (x.id === id && x.kind === "confirm" ? { ...x, state: approve ? "approved" : "rejected" } : x)));
      await consume(res, id);
    } catch (e) {
      setMsgs((m) => [
        ...m.map((x) => (x.id === id && x.kind === "confirm" ? { ...x, state: "failed" as const } : x)),
        { id: nextId(), kind: "assistant", text: (e as Error).message || "משהו השתבש.", error: true },
      ]);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMsgs([]);
    setBusy(false);
    setStatus("");
  }

  const waiting = msgs.some((m) => m.kind === "confirm" && (m.state === "waiting" || m.state === "busy"));
  const suggestions = scope.type === "all" ? SUGGESTIONS_ALL : SUGGESTIONS_SPACE;

  return (
    <>
      <button
        className={`fab ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "סגירת הסוכן" : "פתיחת צ'אט עם הסוכן החכם"}
        aria-expanded={open}
      >
        <span className="fab-icon">{open ? <X size={22} /> : <Sparkles size={22} />}</span>
        {!open && <span className="fab-label">דברו עם הסוכן</span>}
        {!open && unseen && <span className="fab-badge" />}
      </button>

      {open && (
        <section className="chat" role="dialog" aria-label="הסוכן החכם" aria-modal="false">
          <header className="chat-head">
            <div className="chat-avatar">
              <Bot size={20} />
            </div>
            <div className="chat-title">
              <strong>הסוכן החכם</strong>
              <span>
                <i className="online" /> מחובר · יכול לקרוא, להוסיף, לעדכן ולמחוק
              </span>
            </div>
            <button className="icon-btn icon-btn-light" onClick={reset} aria-label="שיחה חדשה" title="שיחה חדשה" disabled={msgs.length === 0}>
              <RotateCcw size={16} />
            </button>
            <button className="icon-btn icon-btn-light" onClick={() => setOpen(false)} aria-label="סגירה">
              <X size={18} />
            </button>
          </header>

          <div className="chat-scope">
            <span>עובד עכשיו על:</span>
            <div className="scope-pick">
              <button
                className="scope-btn"
                onClick={() => setMenu((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={menu}
                style={{ ["--c" as string]: scopeSpace?.color ?? "var(--accent)" } as CSSProperties}
              >
                {scopeSpace ? <i className="scope-dot" /> : <Layers size={14} />}
                {scopeLabel}
                <ChevronDown size={14} />
              </button>
              {menu && (
                <>
                  <div className="scope-backdrop" onClick={() => setMenu(false)} />
                  <ul className="scope-menu" role="listbox">
                    <li>
                      <button role="option" aria-selected={scope.type === "all"} onClick={() => changeScope({ type: "all" })}>
                        <Layers size={14} />
                        כל המרחבים
                        {scope.type === "all" && <Check size={14} className="scope-check" />}
                      </button>
                    </li>
                    {spaces.map((s) => (
                      <li key={s.id}>
                        <button
                          role="option"
                          aria-selected={scope.type === "space" && scope.spaceId === s.id}
                          onClick={() => changeScope({ type: "space", spaceId: s.id })}
                          style={{ ["--c" as string]: s.color } as CSSProperties}
                        >
                          <i className="scope-dot" />
                          {s.name}
                          {scope.type === "space" && scope.spaceId === s.id && <Check size={14} className="scope-check" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="chat-list" ref={listRef} aria-live="polite">
            {msgs.length === 0 && (
              <div className="chat-welcome">
                <div className="chat-welcome-icon">
                  <Sparkles size={26} />
                </div>
                <h3>איך אפשר לעזור?</h3>
                <p>
                  אני רואה ופועל רק על <b>{scopeLabel}</b>. אפשר לשאול אותי שאלות או לבקש ממני לנהל משימות בשבילכם.
                </p>
                <div className="suggestions">
                  {suggestions.map((s) => (
                    <button key={s} className="suggest" onClick={() => (s.endsWith(": ") ? setInput(s) : send(s))}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m) => {
              if (m.kind === "note") return <div key={m.id} className="chat-note">{m.text}</div>;
              if (m.kind === "user")
                return (
                  <div key={m.id} className="msg msg-user">
                    <div className="bubble">{m.text}</div>
                  </div>
                );
              if (m.kind === "assistant")
                return (
                  <div key={m.id} className="msg msg-bot">
                    <div className="msg-avatar">
                      <Bot size={15} />
                    </div>
                    <div className={`bubble ${m.error ? "bubble-error" : ""}`}>
                      <Rich text={m.text} />
                    </div>
                  </div>
                );
              return (
                <div key={m.id} className="msg msg-bot">
                  <div className="msg-avatar">
                    <Bot size={15} />
                  </div>
                  <div className={`confirm-card is-${m.state}`}>
                    <div className="confirm-head">
                      <AlertTriangle size={16} />
                      <strong>נדרש אישור</strong>
                    </div>
                    <p>
                      אני עומד <b>{m.summary}</b>.
                    </p>
                    <div className="confirm-count">{m.count} משימות ישתנו</div>
                    <ul>
                      {m.items.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                      {m.count > m.items.length && <li className="more">ועוד {m.count - m.items.length}…</li>}
                    </ul>
                    {m.state === "waiting" || m.state === "busy" ? (
                      <div className="confirm-actions">
                        <button className="btn btn-primary btn-sm" disabled={m.state === "busy"} onClick={() => decide(m.id, m.pendingId, true)}>
                          <Check size={15} />
                          מאשר
                        </button>
                        <button className="btn btn-outline btn-sm" disabled={m.state === "busy"} onClick={() => decide(m.id, m.pendingId, false)}>
                          <X size={15} />
                          לא מאשר
                        </button>
                      </div>
                    ) : (
                      <div className="confirm-result">
                        {m.state === "approved" ? "אושר ובוצע" : m.state === "rejected" ? "לא אושר, לא בוצע שינוי" : "הפעולה נכשלה"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {busy && (
              <div className="msg msg-bot">
                <div className="msg-avatar">
                  <Bot size={15} />
                </div>
                <div className="bubble typing">
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{status}</span>
                </div>
              </div>
            )}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder={waiting ? "אפשר להמשיך לכתוב, או לאשר/לבטל למעלה…" : "כתבו לסוכן…"}
              aria-label="הודעה לסוכן"
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                  (e.target as HTMLTextAreaElement).style.height = "auto";
                }
              }}
            />
            <button type="submit" className="send-btn" disabled={busy || !input.trim()} aria-label="שליחה">
              <SendHorizontal size={18} />
            </button>
          </form>
          <div className="chat-foot">הסוכן יבקש אישור לפני מחיקה או שינוי של יותר מ-3 משימות</div>
        </section>
      )}
    </>
  );
}
