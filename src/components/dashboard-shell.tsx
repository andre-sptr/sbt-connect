"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, FolderKanban, LogOut, Menu, MessageCircle, ScrollText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/groups", label: "Groups", icon: MessageCircle },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
];

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-700 font-bold text-white">S</div>
        <div>
        <p className="font-semibold leading-tight text-foreground">SBT Connect</p>
        <p className="text-xs text-muted-foreground">WAHA Bot Control</p>
        </div>
      </div>
      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active && "bg-red-700 text-white",
                !active && "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Logout */}
      <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-secondary-foreground" onClick={logout}>
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar Desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card/95 shadow-soft backdrop-blur lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r bg-card shadow-xl transition-transform duration-300 lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b bg-card/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Hamburger mobile */}
              <button
                type="button"
                className="rounded-md border border-input bg-background p-2 text-muted-foreground lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="hidden lg:block">
                <p className="text-sm font-medium text-primary">Dashboard</p>
                <p className="text-xs text-muted-foreground">Kelola pengiriman screenshot Google Sheet ke WhatsApp.</p>
              </div>
              <div className="lg:hidden">
                <p className="text-sm font-semibold text-foreground">SBT Connect</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
