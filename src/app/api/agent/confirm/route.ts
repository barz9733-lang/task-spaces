import { NextResponse } from "next/server";
import { runResume } from "@/lib/agent/run";
import { agentAvailable } from "@/lib/agent/status";
import { ndjson } from "@/lib/agent/stream";
import { isUUID } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { pendingId?: unknown; approve?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!isUUID(body.pendingId) || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (body.approve && !(await agentAvailable())) {
    return NextResponse.json({ error: "הסוכן כבוי כרגע (אין מפתח OpenAI תקף)." }, { status: 503 });
  }
  return ndjson(runResume(body.pendingId, body.approve));
}
