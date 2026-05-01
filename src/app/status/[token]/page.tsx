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
      ? "text-emerald-600 bg-emerald-50"
      : data.lastRunStatus === "failed"
      ? "text-red-600 bg-red-50"
      : "text-slate-600 bg-slate-50";

  const statusLabel =
    data.lastRunStatus === "success" ? "Terakhir Sukses" : data.lastRunStatus === "failed" ? "Terakhir Gagal" : "Belum Ada Run";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50/30 flex items-start justify-center p-6">
      <div className="w-full max-w-xl space-y-6 mt-12">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-red-700 font-bold text-white text-2xl shadow-lg">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Status halaman publik — SBT Connect</p>
          <div className="mt-3 inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${data.enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <span className="text-sm font-medium text-slate-700">{data.enabled ? "Aktif" : "Paused"}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <TrendingUp className="h-4 w-4" />
              Success Rate
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {data.successRate !== null ? `${data.successRate}%` : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">7 hari terakhir</p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <CheckCircle2 className="h-4 w-4" />
              Total Run
            </div>
            <p className="text-3xl font-bold text-slate-900">{data.totalRuns}</p>
            <p className="text-xs text-slate-400 mt-1">7 hari terakhir</p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <Clock className="h-4 w-4" />
              Terakhir Run
            </div>
            <p className="text-base font-semibold text-slate-900">{formatDate(data.lastRunAt)}</p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <Clock className="h-4 w-4" />
              Jadwal Berikutnya
            </div>
            <p className="text-base font-semibold text-slate-900">{formatDate(data.nextRunAt)}</p>
          </div>
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${statusColor}`}>
          {data.lastRunStatus === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : data.lastRunStatus === "failed" ? (
            <XCircle className="h-5 w-5 shrink-0" />
          ) : (
            <Clock className="h-5 w-5 shrink-0" />
          )}
          <div>
            <p className="font-semibold text-sm">{statusLabel}</p>
            {data.lastRunError && <p className="text-xs mt-0.5 opacity-80">{data.lastRunError}</p>}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Halaman ini dapat diakses siapa saja. Ditenagai oleh SBT Connect.
        </p>
      </div>
    </div>
  );
}
