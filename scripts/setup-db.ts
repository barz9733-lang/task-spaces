/**
 * Creates the schema (idempotent) and optionally seeds demo data.
 *   npm run db:setup          -> schema only
 *   npm run db:seed           -> schema + demo data (only if there are no spaces yet)
 *   npm run db:reset          -> wipes spaces/tasks, then seeds
 */
import { neon } from "@neondatabase/serverless";
import { addDays, todayISO } from "../src/lib/dates";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (run through `npm run db:setup`).");
  process.exit(1);
}
const sql = neon(url);
const q = (text: string, params: unknown[] = []) => sql.query(text, params) as Promise<Record<string, unknown>[]>;

const args = new Set(process.argv.slice(2));

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS spaces (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     color text NOT NULL,
     view text NOT NULL DEFAULT 'kanban' CHECK (view IN ('kanban','todo','calendar')),
     position integer NOT NULL DEFAULT 0,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
     title text NOT NULL,
     description text NOT NULL DEFAULT '',
     priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
     status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','on_hold','done')),
     due_date date,
     completed_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence text CHECK (recurrence IN ('daily','weekly','monthly','yearly'))`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `CREATE INDEX IF NOT EXISTS tasks_space_idx ON tasks(space_id)`,
  `CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(due_date)`,
  `CREATE TABLE IF NOT EXISTS settings (
     key text PRIMARY KEY,
     value jsonb
   )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     endpoint text PRIMARY KEY,
     p256dh text NOT NULL,
     auth text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS agent_usage (
     id bigserial PRIMARY KEY,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE agent_usage ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'request'`,
  `ALTER TABLE agent_usage ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0`,
  `ALTER TABLE agent_usage ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS agent_usage_time_idx ON agent_usage(created_at)`,
  `CREATE TABLE IF NOT EXISTS agent_pending (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     payload jsonb NOT NULL,
     status text NOT NULL DEFAULT 'pending',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
];

type SeedTask = {
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "new" | "in_progress" | "on_hold" | "done";
  due: number | null; // days from today
  doneDaysAgo?: number;
};

async function seed() {
  const today = todayISO();
  const spaces: { name: string; color: string; view: string; tasks: SeedTask[] }[] = [
    {
      name: "בית",
      color: "#10b981",
      view: "todo",
      tasks: [
        { title: "לחדש ביטוח רכב", description: "הפוליסה נגמרת, להשוות הצעות לפני החידוש", priority: "urgent", status: "in_progress", due: -2 },
        { title: "לשלם ארנונה", priority: "high", status: "new", due: 3 },
        { title: "לקנות חלב וביצים", priority: "medium", status: "new", due: 0 },
        { title: "להתקשר לסבתא", description: "לשאול מה שלומה ולתאם ביקור בשבת", priority: "medium", status: "new", due: 1 },
        { title: "לשלם חשבון חשמל", priority: "high", status: "done", due: -1, doneDaysAgo: 0 },
      ],
    },
    {
      name: "עבודה",
      color: "#6366f1",
      view: "kanban",
      tasks: [
        { title: "לשלוח הצעת מחיר ללקוח", description: "לעדכן את התמחור לפי הפגישה האחרונה", priority: "urgent", status: "in_progress", due: 0 },
        { title: "להכין מצגת לפגישת צוות", priority: "high", status: "in_progress", due: 1 },
        { title: "לסכם את דוח הרבעון", priority: "high", status: "new", due: 5 },
        { title: "לעדכן את לוח הזמנים של הפרויקט", description: "ממתין לתשובה מהספק", priority: "medium", status: "on_hold", due: -1 },
        { title: "להכין תקציב לרבעון הבא", priority: "medium", status: "new", due: 9 },
        { title: "לסיים סקירת קוד", priority: "low", status: "done", due: -1, doneDaysAgo: 0 },
      ],
    },
    {
      name: "לימודים",
      color: "#d946ef",
      view: "calendar",
      tasks: [
        { title: "להגיש עבודה בסטטיסטיקה", priority: "urgent", status: "new", due: 2 },
        { title: "ללמוד למבחן באקרוני", description: "פרקים 4 עד 7 ותרגילים מהשנים הקודמות", priority: "high", status: "in_progress", due: 7 },
        { title: "לקרוא פרק 5 בספר", priority: "medium", status: "new", due: -3 },
        { title: "להירשם לקורסים של הסמסטר הבא", priority: "high", status: "new", due: 12 },
        { title: "לסכם את הרצאה 8", priority: "low", status: "done", due: -8, doneDaysAgo: 8 },
      ],
    },
  ];

  let pos = 0;
  let total = 0;
  for (const s of spaces) {
    const [row] = await q(`INSERT INTO spaces (name, color, view, position) VALUES ($1,$2,$3,$4) RETURNING id`, [
      s.name,
      s.color,
      s.view,
      pos++,
    ]);
    for (const t of s.tasks) {
      const due = t.due === null ? null : addDays(today, t.due);
      await q(
        `INSERT INTO tasks (space_id, title, description, priority, status, due_date, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6::date, CASE WHEN $5 = 'done' THEN now() - ($7::int * interval '1 day') ELSE NULL END)`,
        [row.id, t.title, t.description ?? "", t.priority, t.status, due, t.doneDaysAgo ?? 0],
      );
      total++;
    }
  }
  console.log(`seeded ${spaces.length} spaces and ${total} tasks`);
}

async function main() {
  for (const stmt of SCHEMA) await q(stmt);
  console.log("schema ready");

  if (args.has("--reset")) {
    await q(`DELETE FROM tasks`);
    await q(`DELETE FROM spaces`);
    await q(`DELETE FROM settings`);
    console.log("data wiped");
  }
  if (args.has("--seed")) {
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM spaces`);
    if (Number(n) > 0) console.log("spaces already exist — skipping seed (use --reset to start over)");
    else await seed();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
