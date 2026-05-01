"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock, TrendingUp, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DailyRun = { date: string; success: number; failed: number; running: number };

type StatsData = {
  project: { id: number; name: string };
  totalRuns: number;
  totalRecentRuns: number;
  successRate: number | null;
  avgDurationMs: number | null;
  failedRuns: number;
  dailyRuns: DailyRun[];
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}d`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}d`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(d);
}

interface BarChartProps {
  data: DailyRun[];
}

function BarChart({ data }: BarChartProps) {
  const maxVal = Math.max(...data.map((d) => d.success + d.failed), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d) => {
        const total = d.success + d.failed;
        const successH = total > 0 ? (d.success / maxVal) * 100 : 0;
        const failedH = total > 0 ? (d.failed / maxVal) * 100 : 0;
        return (
          <div key={d.date} className="flex flex-col items-center flex-1 gap-1">
            <div className="flex flex-col-reverse justify-start w-full gap-0.5" style={{ height: "88px" }}>
              {successH > 0 && (
                <div
                  className="w-full rounded-t-sm bg-emerald-500 transition-all"
                  style={{ height: `${successH}%` }}
                  title={`${d.success} sukses`}
                />
              )}
              {failedH > 0 && (
                <div
                  className="w-full rounded-t-sm bg-red-500 transition-all"
                  style={{ height: `${failedH}%` }}
                  title={`${d.failed} gagal`}
                />
              )}
              {total === 0 && <div className="w-full rounded-sm bg-slate-100" style={{ height: "8px" }} />}
            </div>
            <p className="text-[10px] text-slate-400 text-center">{formatShortDate(d.date)}</p>
          </div>
        );
      })}
    </div>
  );
}

interface ProjectStatsProps {
  projectId: number;
}

export function ProjectStats({ projectId }: ProjectStatsProps) {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/stats`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch(() => setError("Gagal memuat statistik."));
  }, [projectId]);

  if (error) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Memuat statistik...</p>;

  const statCards = [
    {
      label: "Total Run",
      value: data.totalRuns,
      sub: `${data.totalRecentRuns} dalam 7 hari`,
      icon: Activity,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Success Rate",
      value: data.successRate !== null ? `${data.successRate}%` : "—",
      sub: "7 hari terakhir",
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Run Gagal",
      value: data.failedRuns,
      sub: "7 hari terakhir",
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Rata-rata Durasi",
      value: formatDuration(data.avgDurationMs),
      sub: "per run",
      icon: Clock,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{card.value}</p>
                <p className="mt-0.5 text-xs text-slate-400">{card.sub}</p>
              </div>
              <div className={`rounded-md p-3 ${card.bg} ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Runs per Hari (7 Hari Terakhir)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={data.dailyRuns} />
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Sukses</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Gagal</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
