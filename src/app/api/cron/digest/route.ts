import { NextResponse } from "next/server";
import { buildDigest } from "@/lib/digest";
import { sendToAll } from "@/lib/push";
import { purgeOldTrash } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Called once a day by Vercel Cron (it sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // daily housekeeping: tasks that sat in the trash long enough are removed for good
  const purged = await purgeOldTrash().catch(() => 0);
  const digest = await buildDigest();
  if (!digest) return NextResponse.json({ skipped: "nothing due", purged });
  return NextResponse.json({ digest: digest.body, purged, ...(await sendToAll(digest)) });
}
