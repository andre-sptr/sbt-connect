"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { FeedbackMessage } from "@/components/feedback-message";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import type { ProjectDto, RunDto } from "@/types/dashboard";

type Overview = {
  totalProjects: number;
  activeProjects: number;
  failedRuns: number;
  latestRuns: RunDto[];
  nextProject: ProjectDto | null;
};

function cleanRunMessage(message: string) {
  return message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

export function OverviewClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/overview", { cache: "no-store" });
    if (!response.ok) {
      setError("Gagal memuat overview.");
      return;
    }
    setData(await response.json());
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  if (error) return <FeedbackMessage type="error">{error}</FeedbackMessage>;
  if (!data) {
    return (
      <div className="space-y-6">
        <DashboardPageHeader title="Overview" description="Status scheduler, projek aktif, dan riwayat pengiriman terbaru." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-3 pt-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <SkeletonLines count={3} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards = [
    { label: "Total Projek", value: data.totalProjects, icon: FolderKanban },
    { label: "Projek Aktif", value: data.activeProjects, icon: Activity },
    { label: "Run Gagal", value: data.failedRuns, icon: AlertTriangle },
    { label: "Jadwal Berikutnya", value: data.nextProject ? formatDateTime(data.nextProject.nextRunAt) : "-", icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <DashboardPageHeader title="Overview" description="Status scheduler, projek aktif, dan riwayat pengiriman terbaru." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{card.value}</p>
              </div>
              <div className="rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <card.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Run Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {data.latestRuns.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Belum ada run.</p>
            ) : (
              data.latestRuns.map((run) => (
                <div key={run.id} className="grid items-start gap-3 p-4 md:grid-cols-[minmax(0,1fr)_120px]">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{run.project?.name || `Project #${run.projectId}`}</p>
                    <p className="text-sm text-muted-foreground">{run.action} · {formatDateTime(run.startedAt)}</p>
                  </div>
                  <Badge
                    className="w-fit justify-self-start capitalize md:justify-self-end"
                    variant={run.status === "success" ? "success" : run.status === "failed" ? "destructive" : "warning"}
                  >
                    {run.status}
                  </Badge>
                  <p className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere] md:col-span-2">
                    {run.errorSummary ? cleanRunMessage(run.errorSummary) : `Selesai: ${formatDateTime(run.finishedAt)}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
