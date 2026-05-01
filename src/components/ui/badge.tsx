import * as React from "react";
import { cn } from "@/lib/utils";

const styles = {
  default: "border-red-200 bg-red-100 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
  success: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
  destructive: "border-red-700 bg-red-700 text-white dark:border-red-500/70 dark:bg-red-500/20 dark:text-red-200",
  muted: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[variant], className)}
      {...props}
    />
  );
}
