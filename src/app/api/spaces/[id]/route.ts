import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { deleteSpace, updateSpace } from "@/lib/repo";
import { ApiError, isUUID, parseSpace } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUUID(id)) throw new ApiError(404, "המרחב לא נמצא");
    const space = await updateSpace(id, parseSpace(await readJson(req), true));
    if (!space) throw new ApiError(404, "המרחב לא נמצא");
    return NextResponse.json(space);
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUUID(id)) throw new ApiError(404, "המרחב לא נמצא");
    if (!(await deleteSpace(id))) throw new ApiError(404, "המרחב לא נמצא");
    return NextResponse.json({ ok: true });
  });
}
