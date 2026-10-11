"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Send, Smartphone } from "lucide-react";
import { useApp } from "./app-context";
import { Modal } from "./ui";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Support = "checking" | "ok" | "needs-install" | "unsupported";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function NotificationsButton() {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return setSupport("unsupported");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (!("PushManager" in window) || !("Notification" in window)) {
        setSupport(isIOS() ? "needs-install" : "unsupported");
        return;
      }
      setSupport("ok");
      setPermission(Notification.permission);
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSupport("unsupported");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast("ההתראות נחסמו. אפשר לאשר אותן בהגדרות הדפדפן או הטלפון.", "error");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(PUBLIC_KEY) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error();
      setSubscribed(true);
      toast("התזכורות הופעלו במכשיר הזה");
    } catch {
      toast("לא הצלחתי להפעיל התראות. נסו שוב.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast("התזכורות כובו במכשיר הזה");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const r = await res.json();
      if (!r.configured) toast("שליחת התראות לא מוגדרת בשרת", "error");
      else if (!r.sent) toast("לא נמצא מכשיר להתראה. כבו והפעילו מחדש.", "error");
      else toast("נשלחה התראת בדיקה");
    } catch {
      toast("השליחה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={`icon-btn ${subscribed ? "is-on" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="תזכורות"
        title="תזכורות"
      >
        {subscribed ? <BellRing size={18} /> : <Bell size={18} />}
      </button>

      {open && (
        <Modal title="תזכורות בטלפון" onClose={() => setOpen(false)}>
          <div className="notif">
            <p className="muted">
              כל בוקר תגיע התראה עם סיכום היום: כמה משימות להיום, כמה באיחור, ומה הכי דחוף. לחיצה עליה פותחת את המערכת.
            </p>

            {support === "needs-install" && (
              <div className="notif-tip">
                <Smartphone size={18} />
                <div>
                  <strong>באייפון צריך קודם להוסיף את המערכת למסך הבית</strong>
                  <p>בכפתור השיתוף של ספארי בחרו ״הוסף למסך הבית״, פתחו את המערכת משם, ואז חזרו לכאן והפעילו.</p>
                </div>
              </div>
            )}
            {support === "unsupported" && <p className="form-error">הדפדפן הזה לא תומך בהתראות. נסו Chrome או Safari מעודכן.</p>}

            {support === "ok" && (
              <div className="notif-actions">
                {subscribed ? (
                  <>
                    <p className="notif-state">
                      <BellRing size={16} /> מופעל במכשיר הזה
                    </p>
                    <button className="btn btn-outline" onClick={test} disabled={busy}>
                      <Send size={15} />
                      שלחו לי התראת בדיקה
                    </button>
                    <button className="btn btn-ghost" onClick={disable} disabled={busy}>
                      כיבוי במכשיר הזה
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={enable} disabled={busy || permission === "denied"}>
                    <Bell size={16} />
                    הפעלת תזכורות במכשיר הזה
                  </button>
                )}
                {permission === "denied" && !subscribed && (
                  <p className="form-error">ההתראות חסומות לאתר הזה. אפשר לאפשר אותן בהגדרות הדפדפן.</p>
                )}
              </div>
            )}
            <small className="muted">אפשר להפעיל בכל מכשיר בנפרד: טלפון, מחשב ועוד.</small>
          </div>
        </Modal>
      )}
    </>
  );
}
