import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type FeedbackMessageProps = {
  children: React.ReactNode;
  type?: "success" | "error" | "info" | "warning";
};

const styles = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200",
  error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200",
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-200",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200",
};

export function FeedbackMessage({ children, type = "info" }: FeedbackMessageProps) {
  const Icon = type === "success" ? CheckCircle2 : type === "info" ? Info : AlertCircle;

  return (
    <div className={cn("flex gap-2 rounded-md border p-3 text-sm", styles[type])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
