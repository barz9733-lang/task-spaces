import { createHash } from "node:crypto";
import { query } from "../db";

/**
 * Whether the agent can be offered at all: there is an OpenAI key and it is not known to be dead.
 * The result is remembered per key (by fingerprint), so a new key re-enables the agent by itself.
 */
const KEY = "agent_key_status";
const RECHECK_MS = 24 * 3600 * 1000;

type Status = { fp: string; ok: boolean; t: number };

const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 16);

async function read(): Promise<Status | null> {
  const rows = await query<{ value: Status }>(`SELECT value FROM settings WHERE key = $1`, [KEY]);
  return rows[0]?.value ?? null;
}

async function write(s: Status): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [KEY, JSON.stringify(s)],
  );
}

export async function agentAvailable(): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return false;
  const fp = fingerprint(key);
  try {
    const s = await read();
    if (s?.fp === fp && (!s.ok || Date.now() - s.t < RECHECK_MS)) return s.ok;
    // listing models costs nothing (no tokens) and tells whether the key still works
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 401 || res.status === 403) {
      await write({ fp, ok: false, t: Date.now() });
      return false;
    }
    if (res.ok) await write({ fp, ok: true, t: Date.now() });
    return true; // other errors are treated as temporary: keep the agent
  } catch {
    return true;
  }
}

/** Called when OpenAI rejects the key during a chat, so the agent is hidden from then on. */
export async function markKeyRejected(): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (key) await write({ fp: fingerprint(key), ok: false, t: Date.now() }).catch(() => {});
}
