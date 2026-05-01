"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { LogDto, ProjectDto } from "@/types/dashboard";

const DAY_OPTIONS = [
  { label: "Semua", value: "0" },
  { label: "Hari ini", value: "1" },
  { label: "7 Hari", value: "7" },
  { label: "30 Hari", value: "30" },
];

export function LogsClient() {
  const [logs, setLogs] = useState<LogDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState("");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState("0");
  const [loading, setLoading] = useState(true);

  async function loadProjects() {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (response.ok) setProjects((await response.json()).projects);
  }

  async function loadLogs() {
    setLoading(true);
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    if (level) query.set("level", level);
    if (q.trim()) query.set("q", q.trim());
    if (days !== "0") query.set("days", days);
    const response = await fetch(`/api/logs?${query.toString()}`, { cache: "no-store" });
    setLoading(false);
    if (response.ok) setLogs((await response.json()).logs);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadLogs();
    const timer = window.setInterval(loadLogs, 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, level, q, days]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Logs</h1>
          <p className="mt-1 text-sm text-slate-600">Riwayat proses bot dan scheduler dengan auto refresh.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} title="Export ke CSV">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={loadLogs}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-5">
          {/* Filter baris 1: search keyword */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Cari pesan log..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* Filter baris 2: project, level, days */}
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-10 rounded-md border bg-white px-3 text-sm"
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
              onChange={(event) => setLevel(event.target.value)}
              className="h-10 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">Semua level</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
            <select
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="h-10 rounded-md border bg-white px-3 text-sm"
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
            {loading ? <p className="p-4 text-sm text-slate-500">Memuat log...</p> : null}
            {!loading && logs.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Tidak ada log yang cocok dengan filter.</p>
            ) : null}
            {logs.map((log) => (
              <div key={log.id} className="grid gap-3 p-4 lg:grid-cols-[160px_130px_1fr]">
                <p className="text-sm text-slate-500">{formatDateTime(log.createdAt)}</p>
                <Badge variant={levelVariant(log.level)}>{log.level}</Badge>
                <div>
                  <p className="text-sm text-slate-950">{log.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {log.project?.name || "System"} {log.run ? `· ${log.run.action}/${log.run.status}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {logs.length > 0 && (
            <p className="text-right text-xs text-slate-400">{logs.length} entri ditampilkan</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
