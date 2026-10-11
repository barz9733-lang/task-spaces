import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { deletePushSub } from "@/lib/repo";
import { ApiError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await readJson(req)) as { endpoint?: unknown };
    if (typeof body?.endpoint !== "string") throw new ApiError(400, "בקשה לא תקינה");
    await deletePushSub(body.endpoint);
    return NextResponse.json({ ok: true });
  });
}
