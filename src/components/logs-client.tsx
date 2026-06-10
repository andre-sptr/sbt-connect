"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { SkeletonLines } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import type { LogDto, ProjectDto } from "@/types/dashboard";

const DAY_OPTIONS = [
  { label: "Semua", value: "0" },
  { label: "Hari ini", value: "1" },
  { label: "7 Hari", value: "7" },
  { label: "30 Hari", value: "30" },
];

function cleanLogMessage(message: string) {
  return message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

type LogsPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function LogsClient() {
  const [logs, setLogs] = useState<LogDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState("");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState("0");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<LogsPagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async function loadProjects() {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (response.ok) setProjects((await response.json()).projects);
  }, []);

  const loadLogs = useCallback(async function loadLogs() {
    setLoading(true);
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    if (level) query.set("level", level);
    if (q.trim()) query.set("q", q.trim());
    if (days !== "0") query.set("days", days);
    query.set("page", String(page));
    const response = await fetch(`/api/logs?${query.toString()}`, { cache: "no-store" });
    setLoading(false);
    if (response.ok) {
      const json: { logs: LogDto[]; pagination?: LogsPagination } = await response.json();
      setLogs(json.logs);
      if (json.pagination) setPagination(json.pagination);
    }
  }, [days, level, page, projectId, q]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadLogs();
    const timer = window.setInterval(loadLogs, 8000);
    return () => window.clearInterval(timer);
  }, [loadLogs]);

  function updateProjectId(value: string) {
    setProjectId(value);
    setPage(1);
  }

  function updateLevel(value: string) {
    setLevel(value);
    setPage(1);
  }

  function updateQuery(value: string) {
    setQ(value);
    setPage(1);
  }

  function updateDays(value: string) {
    setDays(value);
    setPage(1);
  }

  function levelVariant(value: string) {
    if (value === "success") return "success";
    if (value === "error") return "destructive";
    if (value === "warning") return "warning";
    return "muted";
  }

  function handleExport() {
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    if (level) query.set("level", level);
    if (q.trim()) query.set("q", q.trim());
    if (days !== "0") query.set("days", days);
    window.open(`/api/logs/export?${query.toString()}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Logs"
        description="Riwayat proses bot dan scheduler."
        actions={<>
          <Button variant="outline" onClick={handleExport} title="Export ke CSV">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={loadLogs} aria-label="Refresh log">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </>}
      />
      <Card>
        <CardContent className="space-y-4 pt-5">
          {/* Filter baris 1: search keyword */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari pesan log..."
              value={q}
              onChange={(e) => updateQuery(e.target.value)}
            />
          </div>
          {/* Filter baris 2: project, level, days */}
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={projectId}
              onChange={(event) => updateProjectId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Semua project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={level}
              onChange={(event) => updateLevel(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Semua level</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
            <select
              value={days}
              onChange={(event) => updateDays(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {/* Log list */}
          <div className="divide-y rounded-md border">
            {loading ? (
              <div className="p-4">
                <SkeletonLines count={5} />
              </div>
            ) : null}
            {!loading && logs.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Tidak ada log yang cocok dengan filter.</p>
            ) : null}
            {logs.map((log) => (
              <div key={log.id} className="grid items-start gap-3 p-4 lg:grid-cols-[180px_96px_minmax(0,1fr)]">
                <p className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(log.createdAt)}</p>
                <Badge className="w-fit justify-self-start capitalize" variant={levelVariant(log.level)}>
                  {log.level}
                </Badge>
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
                    {cleanLogMessage(log.message)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {log.project?.name || "System"} {log.run ? `· ${log.run.action}/${log.run.status}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {pagination.total > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Menampilkan {(pagination.page - 1) * pagination.pageSize + 1}-
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total} entri
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPreviousPage || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span className="min-w-24 text-center text-xs text-muted-foreground">
                  Halaman {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNextPage || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
