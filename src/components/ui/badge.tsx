import * as React from "react";
import { cn } from "@/lib/utils";

const styles = {
  default: "bg-red-100 text-red-800 border-red-200",
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  destructive: "bg-red-700 text-white border-red-700",
  muted: "bg-slate-100 text-slate-700 border-slate-200",
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
