import { notFound } from "next/navigation";
import { CheckCircle2, Clock, TrendingUp, XCircle } from "lucide-react";

type Props = { params: Promise<{ token: string }> };

type StatusData = {
  name: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  successRate: number | null;
  totalRuns: number;
  lastRunStatus: string | null;
  lastRunError: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export const dynamic = "force-dynamic";

export default async function PublicStatusPage({ params }: Props) {
  const { token } = await params;

  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/status/${token}`, {
    cache: "no-store",
  });

  if (!res.ok) notFound();
  const data: StatusData = await res.json();

  const statusColor =
    data.lastRunStatus === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200"
      : data.lastRunStatus === "failed"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
      : "border-input bg-muted text-muted-foreground";

  const statusLabel =
    data.lastRunStatus === "success" ? "Terakhir Sukses" : data.lastRunStatus === "failed" ? "Terakhir Gagal" : "Belum Ada Run";

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-slate-50 to-red-50/30 p-6 dark:from-background dark:to-red-950/10">
      <div className="mt-12 w-full max-w-xl space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-red-700 text-2xl font-bold text-white shadow-lg">
            S
          </div>
          <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Status halaman publik — SBT Connect</p>
          <div className="mt-3 inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${data.enabled ? "animate-pulse bg-emerald-500" : "bg-muted-foreground"}`} />
            <span className="text-sm font-medium text-foreground">{data.enabled ? "Aktif" : "Paused"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Success Rate
            </div>
            <p className="text-3xl font-bold text-foreground">
              {data.successRate !== null ? `${data.successRate}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">7 hari terakhir</p>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Total Run
            </div>
            <p className="text-3xl font-bold text-foreground">{data.totalRuns}</p>
            <p className="mt-1 text-xs text-muted-foreground">7 hari terakhir</p>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Terakhir Run
            </div>
            <p className="text-base font-semibold text-foreground">{formatDate(data.lastRunAt)}</p>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Jadwal Berikutnya
            </div>
            <p className="text-base font-semibold text-foreground">{formatDate(data.nextRunAt)}</p>
          </div>
        </div>

        <div className={`flex items-center gap-3 rounded-xl border p-4 ${statusColor}`}>
          {data.lastRunStatus === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : data.lastRunStatus === "failed" ? (
            <XCircle className="h-5 w-5 shrink-0" />
          ) : (
            <Clock className="h-5 w-5 shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold">{statusLabel}</p>
            {data.lastRunError && <p className="mt-0.5 text-xs opacity-80">{data.lastRunError}</p>}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Halaman ini dapat diakses siapa saja. Ditenagai oleh SBT Connect.
        </p>
      </div>
    </div>
  );
}
