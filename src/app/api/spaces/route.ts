import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { createSpace } from "@/lib/repo";
import { parseSpace } from "@/lib/validate";
import type { ViewType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const data = parseSpace(await readJson(req), false) as { name: string; color: string; view: ViewType };
    return NextResponse.json(await createSpace(data), { status: 201 });
  });
}
