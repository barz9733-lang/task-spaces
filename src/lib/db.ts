import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await getClient().query(text, params);
  return rows as unknown as T[];
}
