/** Session cookie signing — uses Web Crypto so it runs in the Edge middleware and in Node. */

export const SESSION_COOKIE = "ts_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

function secret(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
  return `${exp}.${await hmac(exp)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !secret()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(exp));
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // compare hashes so length / content never short-circuit
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return safeEqual(toHex(a), toHex(b));
}
