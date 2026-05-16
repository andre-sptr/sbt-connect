"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Code2, FolderKanban, LogOut, Menu, MessageCircle, Radio, ScrollText, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/python-jobs", label: "Pythons", icon: Code2 },
  { href: "/dashboard/python-dependencies", label: "Py Deps", icon: Code2 },
  { href: "/dashboard/groups", label: "Groups", icon: MessageCircle },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
];

const adminNavItems = [
  { href: "/dashboard/admin/users", label: "Kelola User", icon: Shield },
  { href: "https://wa.sbtconnect.online/", label: "WA Broadcast", icon: Radio, external: true },
];

type SidebarProps = {
  pathname: string;
  role: "admin" | "user";
  username: string;
  onNavigate?: () => void;
};

function SidebarContent({ pathname, role, username, onNavigate }: SidebarProps) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/icon.svg" alt="SBT Connect" className="h-10 w-10 rounded-lg" />
        <div>
          <p className="font-semibold leading-tight text-foreground">SBT Connect</p>
          <p className="text-xs text-muted-foreground">WAHA Bot Control</p>
        </div>
      </div>

      {/* User info */}
      <div className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
        <p className="text-xs font-medium text-foreground truncate">{username}</p>
        <p className="text-xs text-muted-foreground capitalize">{role}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
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

        {/* Admin section */}
        {role === "admin" && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Admin
              </p>
            </div>
            {adminNavItems.map((item) => {
              const active = !item.external && pathname.startsWith(item.href);
              const linkProps = item.external
                ? { target: "_blank" as const, rel: "noopener noreferrer" }
                : { onClick: onNavigate };
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  {...linkProps}
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
          </>
        )}
      </nav>

      {/* Logout */}
      <Button
        variant="ghost"
        className="mt-2 w-full justify-start text-muted-foreground hover:text-secondary-foreground"
        onClick={logout}
      >
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </div>
  );
}

type DashboardShellProps = {
  children: React.ReactNode;
  username: string;
  role: "admin" | "user";
};

export function DashboardShell({ children, username, role }: DashboardShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar Desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card/95 shadow-soft backdrop-blur lg:block">
        <SidebarContent pathname={pathname} role={role} username={username} />
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
        <SidebarContent
          pathname={pathname}
          role={role}
          username={username}
          onNavigate={() => setDrawerOpen(false)}
        />
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
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:block">{username}</span>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
