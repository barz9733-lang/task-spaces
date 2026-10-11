import { PRIORITY_BY_VALUE } from "./constants";
import { diffDays, todayISO } from "./dates";
import type { PushPayload } from "./push";
import { listTasks } from "./repo";

/** Morning summary. Returns null when there is nothing worth interrupting for. */
export async function buildDigest(): Promise<PushPayload | null> {
  const today = todayISO();
  const open = (await listTasks()).filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const dueToday = open.filter((t) => t.due_date === today);
  const urgent = open.filter((t) => t.priority === "urgent" && !(t.due_date && t.due_date <= today));
  const relevant = [...overdue, ...dueToday, ...urgent];
  if (relevant.length === 0) return null;

  const score = (t: (typeof open)[number]) =>
    PRIORITY_BY_VALUE[t.priority].rank * 10 + (t.due_date ? Math.max(0, 15 - Math.max(0, diffDays(t.due_date, today))) : 0);
  const top = [...relevant].sort((a, b) => score(b) - score(a)).slice(0, 3);

  const parts: string[] = [];
  if (dueToday.length) parts.push(`להיום ${dueToday.length}`);
  if (overdue.length) parts.push(`באיחור ${overdue.length}`);
  if (urgent.length) parts.push(`דחוף ${urgent.length}`);

  return {
    title: "בוקר טוב, הנה היום שלך",
    body: `${parts.join(" · ")}\n${top.map((t) => `• ${t.title}`).join("\n")}`,
    tag: "daily-digest",
    url: "/",
  };
}
