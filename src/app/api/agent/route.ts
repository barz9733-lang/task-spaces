import { NextResponse } from "next/server";
import { runChat } from "@/lib/agent/run";
import { ndjson } from "@/lib/agent/stream";
import { takeAgentQuota } from "@/lib/repo";
import { isUUID } from "@/lib/validate";
import type { AgentScope, ChatTurn } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { messages?: unknown; scope?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const messages: ChatTurn[] = Array.isArray(body.messages)
    ? (body.messages as ChatTurn[]).filter(
        (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim(),
      )
    : [];
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "חסרה הודעה" }, { status: 400 });
  }
  if (messages.some((m) => m.content.length > 4000)) {
    return NextResponse.json({ error: "ההודעה ארוכה מדי" }, { status: 400 });
  }

  const s = body.scope as { type?: string; spaceId?: unknown } | undefined;
  let scope: AgentScope;
  if (s?.type === "space" && isUUID(s.spaceId)) scope = { type: "space", spaceId: s.spaceId };
  else if (s?.type === "all") scope = { type: "all" };
  else return NextResponse.json({ error: "חסרה בחירת סביבת עבודה" }, { status: 400 });

  if (!(await takeAgentQuota(Number(process.env.AGENT_HOURLY_LIMIT) || 60))) {
    return NextResponse.json({ error: "הגעתם למגבלת השימוש בסוכן לשעה האחרונה. נסו שוב בעוד קצת." }, { status: 429 });
  }

  return ndjson(runChat(messages, scope));
}
