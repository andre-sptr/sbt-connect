"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, Pause, Play, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { ProjectDto } from "@/types/dashboard";

export function ProjectsClient() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/projects?search=${encodeURIComponent(search)}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) {
      setError("Gagal memuat projek.");
      return;
    }
    setProjects((await response.json()).projects);
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function remove(id: number) {
    if (!window.confirm("Hapus projek ini?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    load();
  }

  async function duplicate(id: number) {
    await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
    load();
  }

  async function toggle(project: ProjectDto) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, enabled: !project.enabled }),
    });
    load();
  }

  const activeCount = useMemo(() => projects.filter((project) => project.enabled).length, [projects]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">{activeCount} projek aktif dari {projects.length} projek.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/projects/new">
            <Plus className="h-4 w-4" />
            Buat Projek
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="pt-5">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nama, URL, atau GID..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <div className="overflow-hidden rounded-md border">
            <div className="table-grid bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
              <span>Project</span>
              <span>Schedule</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {loading ? <p className="p-4 text-sm text-slate-500">Memuat projek...</p> : null}
            {!loading && projects.length === 0 ? <p className="p-4 text-sm text-slate-500">Belum ada projek.</p> : null}
            {projects.map((project) => (
              <div key={project.id} className="table-grid gap-3 border-t px-4 py-4 text-sm">
                <div>
                  <Link className="font-semibold text-slate-950 hover:text-red-700" href={`/dashboard/projects/${project.id}`}>
                    {project.name}
                  </Link>
                  <p className="mt-1 text-slate-500">{project.groupIds.length} grup · {project.cellRange}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-800">{project.cronExpression}</p>
                  <p className="mt-1 text-slate-500">Next: {formatDateTime(project.nextRunAt)}</p>
                </div>
                <div>
                  <Badge variant={project.enabled ? "success" : "muted"}>{project.enabled ? "Aktif" : "Paused"}</Badge>
                  <p className="mt-2 text-slate-500">Last: {formatDateTime(project.lastRunAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="icon" title="Pause/resume" onClick={() => toggle(project)}>
                    {project.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" title="Duplicate" onClick={() => duplicate(project.id)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" title="Delete" onClick={() => remove(project.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
