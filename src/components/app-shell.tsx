"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, LayoutDashboard, LogOut, Moon, Plus, Sun } from "lucide-react";
import { AppProvider, useApp } from "./app-context";
import { ChatWidget } from "./chat-widget";
import { SpaceModal } from "./space-modal";
import { TaskModal } from "./task-modal";
import type { AppData } from "@/lib/types";

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") || "light");
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }
  return (
    <button className="icon-btn" onClick={toggle} aria-label={theme === "dark" ? "מעבר למצב בהיר" : "מעבר למצב כהה"} title="מצב תצוגה">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function TopNav() {
  const { spaces, openSpaceEditor } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="brand" aria-label="לדשבורד">
          <span className="brand-mark">
            <CheckSquare size={18} />
          </span>
          <span className="brand-name">משימות</span>
        </Link>

        <nav className="spaces-nav" aria-label="מרחבים">
          <Link href="/" className={`nav-pill ${pathname === "/" ? "is-active" : ""}`}>
            <LayoutDashboard size={15} />
            דשבורד
          </Link>
          {spaces.map((s) => {
            const active = pathname === `/spaces/${s.id}`;
            return (
              <Link
                key={s.id}
                href={`/spaces/${s.id}`}
                className={`nav-pill ${active ? "is-active" : ""}`}
                style={{ ["--c" as string]: s.color }}
                aria-current={active ? "page" : undefined}
              >
                <i className="nav-dot" />
                {s.name}
              </Link>
            );
          })}
          <button className="nav-pill nav-add" onClick={() => openSpaceEditor({ mode: "new" })} aria-label="מרחב חדש">
            <Plus size={15} />
            <span>מרחב חדש</span>
          </button>
        </nav>

        <div className="topnav-actions">
          <ThemeToggle />
          <button className="icon-btn" onClick={logout} aria-label="יציאה" title="יציאה">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function AppShell({ initial, children }: { initial: AppData; children: ReactNode }) {
  return (
    <AppProvider initial={initial}>
      <TopNav />
      <main>{children}</main>
      <TaskModal />
      <SpaceModal />
      <ChatWidget />
      <Toasts />
    </AppProvider>
  );
}
