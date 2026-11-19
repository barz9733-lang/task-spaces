import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from "@/lib/auth";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    /* empty */
  }

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "הסיסמה לא הוגדרה בשרת" }, { status: 500 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (await loginBlocked(ip)) {
    return NextResponse.json({ error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה." }, { status: 429 });
  }

  if (!(await checkPassword(password))) {
    await recordLoginFailure(ip);
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 });
  }
  await clearLoginFailures(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
