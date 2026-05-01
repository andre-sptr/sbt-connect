"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarClock, Eye, FlaskConical, Globe, Link2, MessageSquareText, Play, Save, Send, Table2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CronBuilder } from "@/components/cron-builder";
import { CaptionTemplates } from "@/components/caption-templates";
import { buildPublishedSheetUrl, findDuplicateGroupIds } from "@/lib/project-validation";
import { parseGroupIds } from "@/lib/utils";
import type { ProjectDto, RunDto } from "@/types/dashboard";

type CachedGroup = { remote: string; name: string };

function createDefaultState(timezone: string) {
  return {
    name: "",
    groupIdsText: "",
    spreadsheetUrl: "",
    gid: "",
    cellRange: "",
    caption: "",
    cronExpression: "",
    timezone,
    enabled: true,
    maxRetries: 0,
    retryDelayMinutes: 5,
  };
}

type ProjectEditorProps = {
  mode: "create" | "edit";
  projectId?: number;
  defaultTimezone: string;
};

export function ProjectEditor({ mode, projectId, defaultTimezone }: ProjectEditorProps) {
  const router = useRouter();
  const [state, setState] = useState(() => createDefaultState(defaultTimezone));
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<RunDto | null>(null);
  const [cachedGroups, setCachedGroups] = useState<CachedGroup[]>([]);
  const [showIframe, setShowIframe] = useState(false);
  const [progressLogs, setProgressLogs] = useState<Array<{ id: number; level: string; message: string }>>([]);
  const [runDone, setRunDone] = useState<{ status: string; errorSummary?: string | null } | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  useEffect(() => {
    // Load cached groups for alias labels
    fetch("/api/groups", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.groups) {
          setCachedGroups(j.groups.map((g: { id: string; name: string }) => ({ remote: g.id, name: g.name })));
        }
      })
      .catch(() => { });
  }, []);

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
          maxRetries: json.project.maxRetries ?? 0,
          retryDelayMinutes: json.project.retryDelayMinutes ?? 5,
        });
        setPublicToken(json.project.publicToken ?? null);
      })
      .finally(() => setLoading(false));
  }, [mode, projectId]);

  const groupIds = useMemo(() => parseGroupIds(state.groupIdsText), [state.groupIdsText]);
  const duplicateGroupIds = useMemo(() => findDuplicateGroupIds(groupIds), [groupIds]);
  const hasDuplicateGroupIds = duplicateGroupIds.length > 0;
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
      maxRetries: state.maxRetries,
      retryDelayMinutes: state.retryDelayMinutes,
    };
  }

  async function save() {
    setMessage("");
    setError("");
    if (hasDuplicateGroupIds) {
      setError("Group ID tujuan tidak boleh duplikat.");
      return;
    }

    setSaving(true);
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

  async function run(action: "full" | "screenshot" | "send" | "dry-run") {
    if (!projectId) return;
    setRunning(action);
    setMessage("");
    setError("");
    setLastRun(null);
    setProgressLogs([]);
    setRunDone(null);
    const response = await fetch(`/api/projects/${projectId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    // Buka SSE stream untuk progress real-time
    const sse = new EventSource(`/api/projects/${projectId}/run-stream`);
    sse.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "log") {
        setProgressLogs((prev) => [...prev, { id: data.id, level: data.level, message: data.message }]);
      } else if (data.type === "run-done") {
        setRunDone({ status: data.status, errorSummary: data.errorSummary });
        sse.close();
        setRunning("");
      } else if (data.type === "no-run") {
        sse.close();
        setRunning("");
      }
    };
    sse.onerror = () => { sse.close(); setRunning(""); };

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      sse.close();
      setRunning("");
      setError(json.error || "Run gagal.");
      return;
    }
    setLastRun(json.run);
    setMessage(
      action === "screenshot"
        ? "Screenshot berhasil dibuat."
        : action === "dry-run"
          ? "Dry Run selesai — tidak ada pesan WA dikirim."
          : "Pengiriman selesai."
    );
  }

  if (loading) return <p className="text-sm text-muted-foreground">Memuat project...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            {mode === "create" ? "Buat Projek Bot" : state.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Atur sheet, grup tujuan, caption, dan jadwal otomatis.</p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && projectId && (
            <Link
              href={`/dashboard/projects/${projectId}/stats`}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <BarChart3 className="h-4 w-4" />
              Statistik
            </Link>
          )}
          <Button onClick={save} disabled={saving || hasDuplicateGroupIds}>
            <Save className="h-4 w-4" />
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Tujuan WA */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" />
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
                  {groupIds.map((groupId, index) => {
                    const alias = cachedGroups.find((g) => g.remote === groupId)?.name;
                    return (
                      <Badge key={`${groupId}-${index}`} variant={groupId.endsWith("@g.us") ? "default" : "warning"} title={groupId}>
                        {alias ? `${alias}` : groupId}
                      </Badge>
                    );
                  })}
                </div>
                {hasDuplicateGroupIds && (
                  <p className="text-xs text-red-600 dark:text-red-300">Group ID tujuan tidak boleh duplikat: {duplicateGroupIds.join(", ")}.</p>
                )}
                {groupIds.some((id) => !id.endsWith("@g.us")) && (
                  <p className="text-xs text-amber-600 dark:text-amber-300">⚠ Beberapa Group ID tidak valid (harus diakhiri @g.us).</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Spreadsheet */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-primary" />
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
                <div className="break-all rounded-md border bg-muted p-3 text-xs text-muted-foreground">{previewUrl || "URL belum valid."}</div>
              </div>
            </CardContent>
          </Card>

          {/* Pesan & Jadwal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Pesan &amp; Jadwal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Caption</Label>
                  <CaptionTemplates onSelect={(tpl) => update("caption", tpl)} />
                </div>
                <Textarea
                  value={state.caption}
                  onChange={(event) => update("caption", event.target.value)}
                  placeholder={"*Reporting {projectName}*\nTanggal: {datetime}"}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Placeholder: {"{date}"}, {"{datetime}"}, {"{projectName}"}</p>
              </div>

              <div className="space-y-2">
                <Label>Jadwal (Crontab)</Label>
                <CronBuilder value={state.cronExpression} onChange={(cron) => update("cronExpression", cron)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={state.timezone}
                    placeholder="Asia/Jakarta"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <button
                    type="button"
                    onClick={() => update("enabled", !state.enabled)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <span>{state.enabled ? "Aktif" : "Paused"}</span>
                    <Badge variant={state.enabled ? "success" : "muted"}>{state.enabled ? "ON" : "OFF"}</Badge>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Retry Otomatis (maks gagal)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={state.maxRetries}
                    onChange={(event) => update("maxRetries", Number(event.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">0 = tidak retry. Maks 5 kali.</p>
                </div>
                <div className="space-y-2">
                  <Label>Jeda Retry (menit)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={state.retryDelayMinutes}
                    onChange={(event) => update("retryDelayMinutes", Number(event.target.value))}
                    disabled={state.maxRetries === 0}
                  />
                  <p className="text-xs text-muted-foreground">Waktu tunggu antar percobaan ulang.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar kanan */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aksi Test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mode === "create" ? (
                <p className="text-sm text-muted-foreground">Simpan project dulu untuk menjalankan test.</p>
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
                  <Button variant="outline" className="w-full justify-start" disabled={!!running} onClick={() => run("dry-run")}>
                    <FlaskConical className="h-4 w-4" />
                    {running === "dry-run" ? "Simulasi..." : "Dry Run"}
                  </Button>
                  <Button className="w-full justify-start" disabled={!!running} onClick={() => run("full")}>
                    <Play className="h-4 w-4" />
                    {running === "full" ? "Menjalankan..." : "Run Now"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Real-time progress SSE */}
          {(progressLogs.length > 0 || running) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${running ? "animate-pulse bg-amber-500" : runDone?.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                  {running ? "Sedang berjalan..." : runDone?.status === "success" ? "Selesai" : "Gagal"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
                  {progressLogs.map((log) => (
                    <div key={log.id} className={`flex gap-2 ${log.level === "error" ? "text-red-600 dark:text-red-300" : log.level === "success" ? "text-emerald-600 dark:text-emerald-300" : log.level === "warning" ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>
                      <span className="shrink-0 select-none">{log.level === "error" ? "✗" : log.level === "success" ? "✓" : log.level === "warning" ? "⚠" : "·"}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                  {running && <div className="animate-pulse text-muted-foreground">▌</div>}
                </div>
                {runDone?.errorSummary && (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{runDone.errorSummary}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Screenshot preview */}
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

          {/* Thumbnail preview */}
          {lastRun?.thumbnailPath && !lastRun.screenshotPath ? (
            <Card>
              <CardHeader>
                <CardTitle>Thumbnail Run</CardTitle>
              </CardHeader>
              <CardContent>
                <img src={`/api/runs/${lastRun.id}/thumbnail?t=${Date.now()}`} alt="Thumbnail run" className="w-full rounded-md border" />
              </CardContent>
            </Card>
          ) : null}

          {/* Preview iframe Google Sheet */}
          {previewUrl && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Preview Sheet
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => setShowIframe((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showIframe ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </div>
              </CardHeader>
              {showIframe && (
                <CardContent>
                  <iframe
                    src={previewUrl}
                    className="h-64 w-full rounded-md border"
                    sandbox="allow-same-origin allow-scripts"
                    title="Preview Google Sheet"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">Preview instan tanpa screenshot. Tampilan mungkin berbeda dengan hasil screenshot.</p>
                </CardContent>
              )}
            </Card>
          )}

          {/* Public Token Card */}
          {mode === "edit" && projectId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Halaman Publik
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {publicToken ? (
                  <>
                    <p className="text-xs text-muted-foreground">URL halaman status publik:</p>
                    <div className="break-all rounded-md bg-muted p-2 text-xs font-mono text-foreground">
                      {typeof window !== "undefined" ? `${window.location.origin}/status/${publicToken}` : `/status/${publicToken}`}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            navigator.clipboard.writeText(`${window.location.origin}/status/${publicToken}`);
                          }
                        }}
                      >
                        Copy URL
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200"
                        disabled={tokenLoading}
                        title="Cabut akses publik"
                        onClick={async () => {
                          setTokenLoading(true);
                          await fetch(`/api/projects/${projectId}/token`, { method: "DELETE" });
                          setPublicToken(null);
                          setTokenLoading(false);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Buat URL publik untuk stakeholder tanpa perlu login.</p>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={tokenLoading}
                      onClick={async () => {
                        setTokenLoading(true);
                        const res = await fetch(`/api/projects/${projectId}/token`, { method: "POST" });
                        const json = await res.json();
                        if (json.publicToken) setPublicToken(json.publicToken);
                        setTokenLoading(false);
                      }}
                    >
                      <Link2 className="h-4 w-4" />
                      {tokenLoading ? "Membuat..." : "Generate Link Publik"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
