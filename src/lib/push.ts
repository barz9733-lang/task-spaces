import webpush from "web-push";
import { deletePushSub, listPushSubs } from "./repo";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://example.com", pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Sends to every stored subscription; dead subscriptions are removed. */
export async function sendToAll(payload: PushPayload): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!configure()) return { sent: 0, removed: 0, configured: false };
  const subs = await listPushSubs();
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ url: "/", ...payload }),
          { TTL: 60 * 60 * 12 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await deletePushSub(s.endpoint);
          removed++;
        } else console.error("push failed", code);
      }
    }),
  );
  return { sent, removed, configured: true };
}
