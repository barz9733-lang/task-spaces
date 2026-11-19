import { handle } from "@/lib/api";
import { PRIORITY_BY_VALUE, RECURRENCES, STATUS_BY_VALUE } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { listSpaces, listTasks } from "@/lib/repo";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // never let a spreadsheet run a cell as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Full backup of every space and task (including archived ones), as JSON or as a spreadsheet-friendly CSV. */
export async function GET(req: Request) {
  return handle(async () => {
    const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
    const [spaces, tasks] = await Promise.all([listSpaces(), listTasks()]);
    const name = `tasks-backup-${todayISO()}.${format}`;
    const headers = {
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    };

    if (format === "json") {
      const body = JSON.stringify({ exported_at: new Date().toISOString(), spaces, tasks }, null, 2);
      return new Response(body, { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
    }

    const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
    const recLabel = new Map(RECURRENCES.map((r) => [r.value as string, r.label]));
    const rows = [
      ["מרחב", "כותרת", "תיאור", "עדיפות", "סטטוס", "תאריך יעד", "חזרה", "תת-משימות", "נוצרה", "הושלמה"],
      ...tasks.map((t) => [
        spaceName.get(t.space_id) ?? "",
        t.title,
        t.description,
        PRIORITY_BY_VALUE[t.priority].label,
        STATUS_BY_VALUE[t.status].label,
        t.due_date ?? "",
        t.recurrence ? (recLabel.get(t.recurrence) ?? "") : "",
        t.subtasks.map((s) => `${s.done ? "[x]" : "[ ]"} ${s.text}`).join(" | "),
        t.created_at.slice(0, 10),
        t.completed_at ? t.completed_at.slice(0, 10) : "",
      ]),
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  });
}
