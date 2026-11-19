import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { listArchivedTasks } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => NextResponse.json({ tasks: await listArchivedTasks() }, { headers: { "Cache-Control": "no-store" } }));
}
