import { requireSession } from "@/lib/auth";
import { ensureScheduler } from "@/lib/scheduler";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  await ensureScheduler();
  return <DashboardShell>{children}</DashboardShell>;
}
