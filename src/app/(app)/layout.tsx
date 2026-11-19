import { AppShell } from "@/components/app-shell";
import { agentAvailable } from "@/lib/agent/status";
import { authEnabled } from "@/lib/auth";
import { getAllData } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [initial, agent] = await Promise.all([getAllData(), agentAvailable()]);
  return (
    <AppShell initial={initial} showLogout={authEnabled()} agent={agent}>
      {children}
    </AppShell>
  );
}
