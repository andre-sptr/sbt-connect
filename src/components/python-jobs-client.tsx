"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Copy, Pause, Play, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { PythonJobDto } from "@/types/dashboard";

type PythonJobsPagination = {
  page: number;
  pageSize: number;
  total: number;
  activeTotal: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function PythonJobsClient() {
  const router = useRouter();
  const [jobs, setJobs] = useState<PythonJobDto[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PythonJobsPagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    activeTotal: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    query.set("page", String(page));
    const response = await fetch(`/api/python-jobs?${query.toString()}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) {
      setError("Gagal memuat Python jobs.");
      return;
    }
    const json: { jobs: PythonJobDto[]; pagination?: PythonJobsPagination } = await response.json();
    setJobs(json.jobs);
    if (json.pagination) setPagination(json.pagination);
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [search, page]);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function remove(id: number) {
    if (!window.confirm("Hapus Python job ini?")) return;
    await fetch(`/api/python-jobs/${id}`, { method: "DELETE" });
    load();
  }

  async function toggle(job: PythonJobDto) {
    const formData = new FormData();
    formData.set("name", job.name);
    formData.set("cronExpression", job.cronExpression);
    formData.set("timezone", job.timezone);
    formData.set("enabled", String(!job.enabled));
    await fetch(`/api/python-jobs/${job.id}`, {
      method: "PUT",
      body: formData,
    });
    load();
  }

  const activeCount = useMemo(
    () => pagination.activeTotal || jobs.filter((job) => job.enabled).length,
    [pagination.activeTotal, jobs]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Python Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCount} job aktif dari {pagination.total || jobs.length} job.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/python-jobs/new">
            <Plus className="h-4 w-4" />
            Buat Job
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari nama, file, atau cron..." value={search} onChange={(event) => updateSearch(event.target.value)} />
          </div>
          {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}
          <div className="rounded-md border max-[900px]:space-y-3 max-[900px]:border-0 min-[901px]:overflow-hidden">
            <div className="table-grid bg-muted px-4 py-3 text-xs font-semibold uppercase text-muted-foreground max-[900px]:hidden">
              <span>Job</span>
              <span>Schedule</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {loading ? <p className="p-4 text-sm text-muted-foreground">Memuat Python jobs...</p> : null}
            {!loading && jobs.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Belum ada Python job.</p> : null}
            {jobs.map((job) => (
              <div
                key={job.id}
                role="link"
                tabIndex={0}
                className="table-grid cursor-pointer gap-4 rounded-lg border bg-card p-4 text-sm shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-[901px]:gap-3 min-[901px]:rounded-none min-[901px]:border-x-0 min-[901px]:border-b-0 min-[901px]:border-t min-[901px]:bg-transparent min-[901px]:px-4 min-[901px]:py-4 min-[901px]:shadow-none"
                onClick={() => router.push(`/dashboard/python-jobs/${job.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/dashboard/python-jobs/${job.id}`);
                  }
                }}
              >
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <div className="flex items-start justify-between gap-3 min-[901px]:block">
                    <p className="min-w-0 font-semibold text-foreground [overflow-wrap:anywhere]">{job.name}</p>
                    <Badge className="shrink-0 min-[901px]:hidden" variant={job.enabled ? "success" : "muted"}>
                      {job.enabled ? "Aktif" : "Paused"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{job.originalFilename}</p>
                </div>
                <div className="min-w-0 rounded-md bg-muted/50 p-3 min-[901px]:rounded-none min-[901px]:bg-transparent min-[901px]:p-0">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground min-[901px]:hidden">Schedule</p>
                  <p className="mt-1 font-medium text-foreground [overflow-wrap:anywhere] min-[901px]:mt-0">{job.cronExpression}</p>
                  <p className="mt-1 text-muted-foreground [overflow-wrap:anywhere]">Next: {formatDateTime(job.nextRunAt)}</p>
                </div>
                <div className="min-w-0 rounded-md bg-muted/50 p-3 min-[901px]:rounded-none min-[901px]:bg-transparent min-[901px]:p-0">
                  <Badge className="max-[900px]:hidden" variant={job.enabled ? "success" : "muted"}>{job.enabled ? "Aktif" : "Paused"}</Badge>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground min-[901px]:hidden">Last run</p>
                  <p className="mt-1 text-muted-foreground [overflow-wrap:anywhere] min-[901px]:mt-2">Last: {formatDateTime(job.lastRunAt)}</p>
                </div>
                <div
                  className="flex flex-wrap gap-2 max-[900px]:pt-1"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Button variant="outline" size="icon" title="Pause/resume" onClick={() => toggle(job)}>
                    {job.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" title="Copy ID" onClick={() => navigator.clipboard.writeText(String(job.id))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" title="Delete" onClick={() => remove(job.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {pagination.total > 0 && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Menampilkan {(pagination.page - 1) * pagination.pageSize + 1}-
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total} job
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <span className="min-w-24 text-center text-xs text-muted-foreground">
                  Halaman {pagination.page} / {pagination.totalPages}
                </span>
                <Button type="button" variant="outline" size="sm" disabled={!pagination.hasNextPage || loading} onClick={() => setPage((current) => current + 1)}>
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
