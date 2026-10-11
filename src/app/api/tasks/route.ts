import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { createTask, spaceExists } from "@/lib/repo";
import { ApiError, parseTask } from "@/lib/validate";
import type { TaskInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const data = parseTask(await readJson(req), false) as TaskInput;
    if (!(await spaceExists(data.space_id))) throw new ApiError(400, "המרחב לא נמצא");
    return NextResponse.json(await createTask(data), { status: 201 });
  });
}
