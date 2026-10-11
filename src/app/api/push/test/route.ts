import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { sendToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const r = await sendToAll({ title: "בדיקת תזכורת", body: "ההתראות עובדות. כך תראו את התזכורות שלכם.", tag: "test" });
    return NextResponse.json(r);
  });
}
