import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { TRASH_DAYS, listTrash, purgeTrash, restoreTasks } from "@/lib/repo";
import { ApiError, isUUID } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () =>
    NextResponse.json({ tasks: await listTrash(), keep_days: TRASH_DAYS }, { headers: { "Cache-Control": "no-store" } }),
  );
}

/** { action: "restore", ids } | { action: "purge", ids? } — purge without ids empties the trash. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await readJson(req)) as { action?: unknown; ids?: unknown };
    const ids = body?.ids;
    if (ids !== undefined && !(Array.isArray(ids) && ids.length > 0 && ids.every(isUUID))) throw new ApiError(400, "בקשה לא תקינה");
    if (body?.action === "restore") {
      if (!ids) throw new ApiError(400, "בקשה לא תקינה");
      return NextResponse.json({ restored: await restoreTasks(ids as string[]) });
    }
    if (body?.action === "purge") return NextResponse.json({ purged: await purgeTrash(ids as string[] | undefined) });
    throw new ApiError(400, "בקשה לא תקינה");
  });
}
