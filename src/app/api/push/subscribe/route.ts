import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { savePushSub } from "@/lib/repo";
import { ApiError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await readJson(req)) as {
      subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    };
    const s = body?.subscription;
    if (
      typeof s?.endpoint !== "string" ||
      !s.endpoint.startsWith("https://") ||
      typeof s.keys?.p256dh !== "string" ||
      typeof s.keys?.auth !== "string"
    )
      throw new ApiError(400, "מנוי לא תקין");
    await savePushSub({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth });
    return NextResponse.json({ ok: true });
  });
}
