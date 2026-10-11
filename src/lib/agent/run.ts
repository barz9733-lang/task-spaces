import { addDays, todayISO, weekdayNames, weekday } from "../dates";
import * as repo from "../repo";
import type { AgentScope, ChatTurn, Space } from "../types";
import {
  TOOL_DEFS,
  TOOL_STATUS_TEXT,
  applyOperation,
  needsConfirmation,
  noopOutput,
  opChangedAnything,
  opCount,
  prepareTool,
  type Operation,
  type ToolCtx,
} from "./tools";

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "message"; text: string }
  | {
      type: "confirm";
      pendingId: string;
      kind: Operation["kind"];
      summary: string;
      count: number;
      items: string[];
      text?: string;
    }
  | { type: "changed" }
  | { type: "error"; message: string };

const MAX_STEPS = 8;
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";

/* ------------------------------------------------------------------ */

function systemPrompt(ctx: ToolCtx): string {
  const days = Array.from({ length: 15 }, (_, i) => {
    const d = addDays(ctx.today, i);
    return `${d} (יום ${weekdayNames[weekday(d)]}${i === 0 ? ", היום" : i === 1 ? ", מחר" : ""})`;
  }).join("\n");
  const spaces = ctx.scopeSpaces.map((s) => s.name).join(", ");
  const scopeLine = ctx.allScope
    ? `סביבת העבודה הנוכחית: כל המרחבים (${spaces}). כשמוסיפים משימה חייבים לציין לאיזה מרחב.`
    : `סביבת העבודה הנוכחית: המרחב "${ctx.scopeSpaces[0].name}" בלבד. אין לך גישה למרחבים אחרים, וכל הכלים פועלים רק עליו.`;

  return `אתה סוכן ניהול משימות חכם שמובנה בתוך מערכת אישית לניהול משימות. אתה מדבר עברית בלבד, בטון חם, ישיר ותמציתי.

${scopeLine}

תאריך היום: ${ctx.today} (יום ${weekdayNames[weekday(ctx.today)]}), שעון ישראל. השבוע מתחיל ביום ראשון.
הימים הקרובים:
${days}

מושגים:
- עדיפות: נמוכה=low, בינונית=medium, גבוהה=high, דחוף=urgent.
- סטטוס: חדשה=new, בעבודה=in_progress, בהשהייה=on_hold, הושלמה=done.
- "באיחור" = תאריך יעד לפני היום ולא הושלמה.
- תאריכים אתה מעביר לכלים תמיד בפורמט YYYY-MM-DD. "מחר", "ביום חמישי", "בעוד שבוע" - חשב מהתאריך של היום. "עד ה-10" = ה-10 הקרוב בחודש (החודש הנוכחי אם עוד לא עבר, אחרת הבא).

כללי עבודה:
1. אתה פועל רק על סביבת העבודה הנוכחית, דרך הכלים. לעולם אל תמציא משימות, מזהים או תוצאות. אם לא קראת - קרא.
2. לשאלות על מצב, חשיבות, עדיפויות או סיכום - השתמש ב-summarize_tasks או read_tasks, והמלץ על בסיס הנתונים האמיתיים.
3. לפעולות על קבוצת משימות ("כל מה שבאיחור", "כל המשימות") - העדף filter על פני רשימת מזהים. לפני עדכון או מחיקה של משימות ספציפיות לפי שם - קרא אותן קודם כדי לקבל מזהים.
4. בקשה להוסיף כמה משימות בבת אחת - קרא ל-add_tasks פעם אחת עם כל המשימות. כשאין עדיפות מפורשת, בחר בינונית; "דחוף"/"חשוב מאוד" מצדיקים דחוף/גבוהה.
5. אישור: המערכת מבקשת אישור מהמשתמש אוטומטית (כפתורי אישור/ביטול) לפני כל מחיקה ולפני פעולה על יותר מ-3 משימות. אל תשאל "בטוח?" בטקסט - פשוט קרא לכלי. אם הכלי יחזיר שהפעולה בוצעה - דווח עליה.
6. אם כלי החזיר שגיאה - תקן את הקריאה ונסה שוב, או הסבר למשתמש בקצרה מה חסר.
7. אחרי כל פעולה ענה בעברית קצרה (עד 2-3 משפטים או רשימה קצרה) מה עשית, עם מספרים. בלי מזהי משימות, בלי JSON, בלי טבלאות, בלי הקדמות מיותרות.
8. בהמלצות על עדיפויות: ציין עד 3-5 משימות, עם נימוק קצר (איחור, דדליין קרוב, עדיפות דחופה).
9. אם הבקשה לא קשורה לניהול המשימות, ענה בקצרה שאתה כאן בשביל המשימות, והצע במה אפשר לעזור.`;
}

/* ------------------------------------------------------------------ */

interface ResponsesOutputItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
}
interface ResponsesResult {
  id: string;
  output: ResponsesOutputItem[];
}

async function callModel(body: Record<string, unknown>): Promise<ResponsesResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, parallel_tool_calls: false, ...body }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("OpenAI error", res.status, detail.slice(0, 500));
    throw new Error(`openai_${res.status}`);
  }
  return (await res.json()) as ResponsesResult;
}

function outputText(r: ResponsesResult): string {
  return r.output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text)
    .join("\n")
    .trim();
}

function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m === "openai_401" || m === "openai_403") return "יש בעיה במפתח ה-OpenAI בשרת. בדקו את OPENAI_API_KEY.";
  if (m === "openai_429") return "הגעתי למגבלת הקצב או המכסה של OpenAI. נסו שוב עוד רגע.";
  if (m === "openai_404") return "המודל שהוגדר לא זמין בחשבון ה-OpenAI.";
  if (e instanceof Error && e.name === "TimeoutError") return "התשובה לקחה יותר מדי זמן. נסו שוב.";
  return "משהו השתבש בדרך. נסו שוב בעוד רגע.";
}

/* ------------------------------------------------------------------ */

export async function buildCtx(scope: AgentScope): Promise<ToolCtx | null> {
  const spaces = await repo.listSpaces();
  let scopeSpaces: Space[];
  if (scope.type === "all") scopeSpaces = spaces;
  else {
    const sp = spaces.find((s) => s.id === scope.spaceId);
    if (!sp) return null;
    scopeSpaces = [sp];
  }
  return { scopeSpaces, allScope: scope.type === "all", today: todayISO() };
}

interface Step {
  input: unknown;
  previous_response_id?: string;
}

async function* loop(ctx: ToolCtx, scope: AgentScope, first: Step, changedBefore: boolean): AsyncGenerator<AgentEvent> {
  const instructions = systemPrompt(ctx);
  let step = first;
  let changed = changedBefore;

  for (let i = 0; i < MAX_STEPS; i++) {
    const resp = await callModel({
      instructions,
      tools: TOOL_DEFS,
      input: step.input,
      previous_response_id: step.previous_response_id,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
    });

    const calls = resp.output.filter((o) => o.type === "function_call");
    const text = outputText(resp);

    if (calls.length === 0) {
      yield { type: "message", text: text || (changed ? "בוצע." : "לא הצלחתי לענות על זה. אפשר לנסח אחרת?") };
      return;
    }

    const [call, ...others] = calls;
    const extra = others.map((o) => ({
      type: "function_call_output",
      call_id: o.call_id,
      output: JSON.stringify({ error: "יש לבצע קריאה אחת בכל פעם. נסה שוב בנפרד." }),
    }));

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      /* handled below as empty args */
    }

    if (process.env.AGENT_DEBUG) console.error("TOOL", call.name, JSON.stringify(args));
    yield { type: "status", text: TOOL_STATUS_TEXT[call.name ?? ""] ?? "עובד על זה…" };
    const prepared = await prepareTool(call.name ?? "", args, ctx);

    let output: unknown;
    if (prepared.type === "result") {
      output = prepared.output;
    } else if (opCount(prepared.op) === 0) {
      output = noopOutput(prepared.op);
    } else if (needsConfirmation(prepared.op)) {
      const pendingId = await repo.savePending({
        scope,
        op: prepared.op,
        response_id: resp.id,
        call_id: call.call_id,
        extra,
        changed,
      });
      yield {
        type: "confirm",
        pendingId,
        kind: prepared.op.kind,
        summary: prepared.op.summary,
        count: prepared.count,
        items: prepared.op.titles.slice(0, 8),
        text: text || undefined,
      };
      return;
    } else {
      output = await applyOperation(prepared.op, ctx);
      if (opChangedAnything(output)) {
        changed = true;
        yield { type: "changed" };
      }
    }

    step = {
      previous_response_id: resp.id,
      input: [{ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) }, ...extra],
    };
  }

  yield { type: "message", text: changed ? "ביצעתי את השינויים, אבל הפעולה התארכה. כדאי לבדוק את התוצאה." : "הפעולה התארכה מדי. נסו לנסח אחרת." };
}

/* ------------------------------------------------------------------ */

export async function* runChat(messages: ChatTurn[], scope: AgentScope): AsyncGenerator<AgentEvent> {
  try {
    const ctx = await buildCtx(scope);
    if (!ctx) {
      yield { type: "error", message: "המרחב שנבחר לא קיים יותר. בחרו מרחב אחר." };
      return;
    }
    const input = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    yield* loop(ctx, scope, { input }, false);
  } catch (e) {
    console.error(e);
    yield { type: "error", message: friendlyError(e) };
  }
}

export async function* runResume(pendingId: string, approve: boolean): AsyncGenerator<AgentEvent> {
  try {
    const payload = (await repo.claimPending(pendingId)) as {
      scope: AgentScope;
      op: Operation;
      response_id: string;
      call_id: string;
      extra: unknown[];
      changed: boolean;
    } | null;
    if (!payload) {
      yield { type: "error", message: "הבקשה לאישור פגה או כבר טופלה. אפשר לבקש שוב." };
      return;
    }
    if (!approve) {
      yield { type: "message", text: "בסדר, ביטלתי. לא שיניתי כלום." };
      return;
    }
    const ctx = await buildCtx(payload.scope);
    if (!ctx) {
      yield { type: "error", message: "המרחב שנבחר לא קיים יותר." };
      return;
    }
    yield { type: "status", text: "מבצע…" };
    const output = await applyOperation(payload.op, ctx);
    const changed = payload.changed || opChangedAnything(output);
    if (opChangedAnything(output)) yield { type: "changed" };
    yield* loop(
      ctx,
      payload.scope,
      {
        previous_response_id: payload.response_id,
        input: [
          { type: "function_call_output", call_id: payload.call_id, output: JSON.stringify(output) },
          ...(payload.extra ?? []),
        ],
      },
      changed,
    );
  } catch (e) {
    console.error(e);
    yield { type: "error", message: friendlyError(e) };
  }
}

