import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { deleteTasks, spaceExists, updateTask } from "@/lib/repo";
import { ApiError, isUUID, parseTask } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUUID(id)) throw new ApiError(404, "המשימה לא נמצאה");
    const patch = parseTask(await readJson(req), true);
    if (patch.space_id && !(await spaceExists(patch.space_id))) throw new ApiError(400, "המרחב לא נמצא");
    const task = await updateTask(id, patch);
    if (!task) throw new ApiError(404, "המשימה לא נמצאה");
    return NextResponse.json(task);
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUUID(id)) throw new ApiError(404, "המשימה לא נמצאה");
    if ((await deleteTasks([id])) === 0) throw new ApiError(404, "המשימה לא נמצאה");
    return NextResponse.json({ ok: true });
  });
}
