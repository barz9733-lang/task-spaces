import { NextResponse } from "next/server";
import { buildDigest } from "@/lib/digest";
import { sendToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Called once a day by Vercel Cron (it sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const digest = await buildDigest();
  if (!digest) return NextResponse.json({ skipped: "nothing due" });
  return NextResponse.json({ digest: digest.body, ...(await sendToAll(digest)) });
}
