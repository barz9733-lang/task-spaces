import { AppShell } from "@/components/app-shell";
import { getAllData } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const initial = await getAllData();
  return <AppShell initial={initial}>{children}</AppShell>;
}
