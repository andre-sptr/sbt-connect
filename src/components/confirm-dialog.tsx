"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  destructive = false,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="presentation">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 text-card-foreground shadow-xl" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={loading}>
            {loading ? "Memproses..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
