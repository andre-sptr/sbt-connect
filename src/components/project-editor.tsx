"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Eye, MessageSquareText, Play, Save, Send, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildPublishedSheetUrl } from "@/lib/project-validation";
import { parseGroupIds } from "@/lib/utils";
import type { ProjectDto, RunDto } from "@/types/dashboard";

const defaultState = {
  name: "",
  groupIdsText: "",
  spreadsheetUrl: "",
  gid: "",
  cellRange: "",
  caption: "",
  cronExpression: "",
  timezone: "Asia/Jakarta",
  enabled: true,
};

export function ProjectEditor({ mode, projectId }: { mode: "create" | "edit"; projectId?: number }) {
  const router = useRouter();
  const [state, setState] = useState(defaultState);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<RunDto | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !projectId) return;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { project?: ProjectDto; error?: string }) => {
        if (!json.project) {
          setError(json.error || "Project tidak ditemukan.");
          return;
        }
        setState({
          name: json.project.name,
          groupIdsText: json.project.groupIds.join("\n"),
          spreadsheetUrl: json.project.spreadsheetUrl,
          gid: json.project.gid,
          cellRange: json.project.cellRange,
          caption: json.project.caption,
          cronExpression: json.project.cronExpression,
          timezone: json.project.timezone,
          enabled: json.project.enabled,
        });
      })
      .finally(() => setLoading(false));
  }, [mode, projectId]);

  const groupIds = useMemo(() => parseGroupIds(state.groupIdsText), [state.groupIdsText]);
  const previewUrl = useMemo(() => {
    try {
      return buildPublishedSheetUrl(state.spreadsheetUrl, state.gid, state.cellRange);
    } catch {
      return "";
    }
  }, [state.spreadsheetUrl, state.gid, state.cellRange]);

  function update<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function payload() {
    return {
      name: state.name,
      groupIds,
      spreadsheetUrl: state.spreadsheetUrl,
      gid: state.gid,
      cellRange: state.cellRange,
      caption: state.caption,
      cronExpression: state.cronExpression,
      timezone: state.timezone,
      enabled: state.enabled,
    };
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    const response = await fetch(mode === "create" ? "/api/projects" : `/api/projects/${projectId}`, {
      method: mode === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    setSaving(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Gagal menyimpan project.");
      return;
    }
    setMessage("Project berhasil disimpan.");
    if (mode === "create") router.push(`/dashboard/projects/${json.project.id}`);
    router.refresh();
  }

  async function run(action: "full" | "screenshot" | "send") {
    if (!projectId) return;
    setRunning(action);
    setMessage("");
    setError("");
    setLastRun(null);
    const response = await fetch(`/api/projects/${projectId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setRunning("");
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Run gagal.");
      return;
    }
    setLastRun(json.run);
    setMessage(action === "screenshot" ? "Screenshot berhasil dibuat." : "Pengiriman selesai.");
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat project...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            {mode === "create" ? "Buat Projek Bot" : state.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Atur sheet, grup tujuan, caption, dan jadwal otomatis.</p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
      {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-red-700" />
                Tujuan WA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Project</Label>
                <Input
                  value={state.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Contoh: Reporting PS Harian"
                />
              </div>
              <div className="space-y-2">
                <Label>Group ID Tujuan</Label>
                <Textarea
                  value={state.groupIdsText}
                  onChange={(event) => update("groupIdsText", event.target.value)}
                  placeholder="120363xxxxxxxx@g.us"
                />
                <div className="flex flex-wrap gap-2">
                  {groupIds.map((groupId) => (
                    <Badge key={groupId} variant={groupId.endsWith("@g.us") ? "default" : "warning"}>
                      {groupId}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-red-700" />
                Spreadsheet
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>URL Spreadsheet Published</Label>
                <Input
                  value={state.spreadsheetUrl}
                  onChange={(event) => update("spreadsheetUrl", event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                />
              </div>
              <div className="space-y-2">
                <Label>GID Sheet</Label>
                <Input value={state.gid} onChange={(event) => update("gid", event.target.value)} placeholder="Contoh: 673821244" />
              </div>
              <div className="space-y-2">
                <Label>Rentang Cell</Label>
                <Input
                  value={state.cellRange}
                  onChange={(event) => update("cellRange", event.target.value.toUpperCase())}
                  placeholder="Contoh: A1:K22"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Preview URL</Label>
                <div className="break-all rounded-md border bg-slate-50 p-3 text-xs text-slate-600">{previewUrl || "URL belum valid."}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-red-700" />
                Pesan & Jadwal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Caption</Label>
                <Textarea
                  value={state.caption}
                  onChange={(event) => update("caption", event.target.value)}
                  placeholder={"*Reporting {projectName}*\nTanggal: {datetime}"}
                />
                <p className="text-xs text-slate-500">Placeholder: {"{date}"}, {"{datetime}"}, {"{projectName}"}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Crontab</Label>
                  <Input
                    value={state.cronExpression}
                    onChange={(event) => update("cronExpression", event.target.value)}
                    placeholder="Contoh: 0 8 * * *"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={state.timezone}
                    onChange={(event) => update("timezone", event.target.value)}
                    placeholder="Asia/Jakarta"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <button
                    type="button"
                    onClick={() => update("enabled", !state.enabled)}
                    className="flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 text-sm"
                  >
                    <span>{state.enabled ? "Aktif" : "Paused"}</span>
                    <Badge variant={state.enabled ? "success" : "muted"}>{state.enabled ? "ON" : "OFF"}</Badge>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aksi Test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mode === "create" ? (
                <p className="text-sm text-slate-500">Simpan project dulu untuk menjalankan test.</p>
              ) : (
                <>
                  <Button variant="outline" className="w-full justify-start" disabled={!!running} onClick={() => run("screenshot")}>
                    <Eye className="h-4 w-4" />
                    {running === "screenshot" ? "Membuat..." : "Test Screenshot"}
                  </Button>
                  <Button variant="outline" className="w-full justify-start" disabled={!!running} onClick={() => run("send")}>
                    <Send className="h-4 w-4" />
                    {running === "send" ? "Mengirim..." : "Test Send"}
                  </Button>
                  <Button className="w-full justify-start" disabled={!!running} onClick={() => run("full")}>
                    <Play className="h-4 w-4" />
                    {running === "full" ? "Menjalankan..." : "Run Now"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          {lastRun?.screenshotPath ? (
            <Card>
              <CardHeader>
                <CardTitle>Preview Screenshot</CardTitle>
              </CardHeader>
              <CardContent>
                <img src={`/api/runs/${lastRun.id}/image?t=${Date.now()}`} alt="Preview screenshot" className="w-full rounded-md border" />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
