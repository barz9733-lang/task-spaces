import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { setDashboardSpaces } from "@/lib/repo";
import { ApiError, isUUID } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  return handle(async () => {
    const body = (await readJson(req)) as { dashboard_spaces?: unknown };
    const v = body?.dashboard_spaces;
    if (v !== null && !(Array.isArray(v) && v.every(isUUID))) throw new ApiError(400, "הגדרה לא תקינה");
    await setDashboardSpaces(v as string[] | null);
    return NextResponse.json({ ok: true });
  });
}
