"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, FolderKanban, LogOut, MessageCircle, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/groups", label: "Groups", icon: MessageCircle },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white/95 p-4 shadow-soft lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-700 font-bold text-white">S</div>
          <div>
            <p className="font-semibold leading-tight text-slate-950">SBT Connect</p>
            <p className="text-xs text-slate-500">WAHA Bot Control</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors",
                  active && "bg-red-700 text-white",
                  !active && "hover:bg-red-50 hover:text-red-800"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Button variant="ghost" className="absolute bottom-4 left-4 right-4 justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b bg-white/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-red-700">Dashboard</p>
              <p className="text-xs text-slate-500">Kelola pengiriman screenshot Google Sheet ke WhatsApp.</p>
            </div>
            <div className="flex gap-2 lg:hidden">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md border bg-white p-2 text-slate-600">
                  <item.icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
