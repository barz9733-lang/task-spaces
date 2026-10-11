import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getUsage } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => NextResponse.json(await getUsage(), { headers: { "Cache-Control": "no-store" } }));
}
