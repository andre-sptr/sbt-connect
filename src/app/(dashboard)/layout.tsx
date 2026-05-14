import { requireSession } from "@/lib/auth";
import { ensureScheduler } from "@/lib/scheduler";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  await ensureScheduler();
  return (
    <DashboardShell username={session.username} role={session.role}>
      {children}
    </DashboardShell>
  );
}
