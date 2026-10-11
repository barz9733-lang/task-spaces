import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getAllData } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => NextResponse.json(await getAllData(), { headers: { "Cache-Control": "no-store" } }));
}
