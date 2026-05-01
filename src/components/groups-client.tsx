"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProjectDto } from "@/types/dashboard";

type WahaGroup = {
  id: string;
  name: string;
  refreshedAt?: string;
};

type GroupsPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function GroupsClient() {
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<WahaGroup[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<GroupsPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProjects() {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (response.ok) {
      const json = await response.json();
      setProjects(json.projects);
      if (!selectedProject && json.projects[0]) setSelectedProject(String(json.projects[0].id));
    }
  }

  async function loadGroups() {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    query.set("page", String(page));
    const response = await fetch(`/api/groups?${query.toString()}`, { cache: "no-store" });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Gagal mengambil grup dari WAHA.");
      return;
    }
    setGroups(json.groups);
    if (json.pagination) setPagination(json.pagination);
  }

  async function refreshGroups() {
    setLoading(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/groups", { method: "POST" });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Gagal refresh grup dari WAHA.");
      return;
    }
    setMessage(`${json.count} grup berhasil di-refresh dan disimpan ke database.`);
    await loadGroups();
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadGroups, 300);
    return () => window.clearTimeout(timer);
  }, [search, page]);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function copyGroup(group: WahaGroup) {
    await navigator.clipboard.writeText(group.id);
    setMessage(`ID ${group.name} disalin.`);
  }

  async function addToProject(group: WahaGroup) {
    const project = projects.find((item) => item.id === Number(selectedProject));
    if (!project) return;
    const groupIds = Array.from(new Set([...project.groupIds, group.id]));
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, groupIds }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error || "Gagal menambahkan grup ke project.");
      return;
    }
    setMessage(`${group.name} ditambahkan ke ${project.name}.`);
    await loadProjects();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Groups</h1>
        <p className="mt-1 text-sm text-slate-600">Cari grup yang sedang join di WAHA session aktif, lalu copy atau tambahkan ke project.</p>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_280px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Cari nama atau ID grup..." />
            </div>
            <select
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              className="h-10 rounded-md border bg-white px-3 text-sm"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <Button variant="outline" onClick={refreshGroups} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <div className="divide-y rounded-md border">
            {loading ? <p className="p-4 text-sm text-slate-500">Memuat grup...</p> : null}
            {!loading && groups.length === 0 ? <p className="p-4 text-sm text-slate-500">Belum ada cache grup. Klik Refresh untuk mengambil dari WAHA dan menyimpannya ke database.</p> : null}
            {groups.map((group) => (
              <div key={group.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-medium text-slate-950">{group.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{group.id}</Badge>
                    <Badge variant="success">Group</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyGroup(group)}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button size="sm" onClick={() => addToProject(group)} disabled={!selectedProject}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {pagination.total > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Menampilkan {(pagination.page - 1) * pagination.pageSize + 1}-
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total} grup
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
                <span className="min-w-24 text-center text-xs text-slate-500">
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
