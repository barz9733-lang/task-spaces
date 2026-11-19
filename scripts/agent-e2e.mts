// End-to-end check of the agent against the real OpenAI API, inside a throwaway space that is deleted at the end.
// Run: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/agent-e2e.mts
import { runChat, runResume } from "../src/lib/agent/run.ts";
import * as repo from "../src/lib/repo.ts";

const space = await repo.createSpace({ name: "בדיקה-זמנית", color: "#a0948a", view: "todo" });
const scope = { type: "space" as const, spaceId: space.id };
const history: { role: "user" | "assistant"; content: string }[] = [];
const before = await repo.getUsage();

async function say(text: string, decide?: boolean) {
  console.log("\n> " + text);
  history.push({ role: "user", content: text });
  let pending: string | null = null;
  const handle = (ev: Record<string, unknown>) => {
    if (ev.type === "confirm") pending = String(ev.pendingId);
    if (ev.type === "message") history.push({ role: "assistant", content: String(ev.text) });
    console.log("  " + JSON.stringify(ev));
  };
  for await (const ev of runChat(history, scope)) handle(ev as Record<string, unknown>);
  if (pending && decide !== undefined) {
    console.log(`  -- user ${decide ? "approves" : "rejects"}`);
    for await (const ev of runResume(pending, decide)) handle(ev as Record<string, unknown>);
  }
}

try {
  await say("תוסיף משימה: לארגן מסיבת יום הולדת ביום שישי, עם שלבים: להזמין עוגה, לשלוח הזמנות, לקנות בלונים");
  await say("תוסיף עוד 4 משימות: לקנות נייר, לתקן מדפסת, לסדר מגירה, להחליף נורה", true);
  await say("תפרק את המשימה 'לתקן מדפסת' לשלבים");
  await say("תמחק את המשימה 'להחליף נורה'", false);
  const tasks = await repo.listTasks([space.id]);
  console.log("\nTASKS:");
  for (const t of tasks) console.log(" -", t.title, "|", t.due_date, "|", t.subtasks.map((s) => s.text).join("; "));
  const after = await repo.getUsage();
  console.log("\nTOKENS in:", after.month.input_tokens - before.month.input_tokens, "out:", after.month.output_tokens - before.month.output_tokens);
} finally {
  console.log("cleanup:", await repo.deleteSpace(space.id));
}
