"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FileCode2, Play, Save, Terminal, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CronBuilder } from "@/components/cron-builder";
import { formatDateTime } from "@/lib/utils";
import type { PythonJobDto, PythonJobLogDto, PythonRunDto } from "@/types/dashboard";

function createDefaultState(timezone: string) {
  return {
    name: "",
    cronExpression: "",
    timezone,
    enabled: true,
  };
}

type PythonJobEditorProps = {
  mode: "create" | "edit";
  jobId?: number;
  defaultTimezone: string;
};

type ProgressLog = {
  id: number;
  level: string;
  stream: string;
  message: string;
};

export function PythonJobEditor({ mode, jobId, defaultTimezone }: PythonJobEditorProps) {
  const router = useRouter();
  const [state, setState] = useState(() => createDefaultState(defaultTimezone));
  const [file, setFile] = useState<File | null>(null);
  const [originalFilename, setOriginalFilename] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<PythonRunDto[]>([]);
  const [logs, setLogs] = useState<PythonJobLogDto[]>([]);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [runDone, setRunDone] = useState<{ status: string; errorSummary?: string | null } | null>(null);

  async function load() {
    if (mode !== "edit" || !jobId) return;
    setLoading(true);
    const response = await fetch(`/api/python-jobs/${jobId}`, { cache: "no-store" });
    const json: { job?: PythonJobDto; runs?: PythonRunDto[]; logs?: PythonJobLogDto[]; error?: string } = await response.json().catch(() => ({}));
    if (!response.ok || !json.job) {
      setError(json.error || "Python job tidak ditemukan.");
      setLoading(false);
      return;
    }
    setState({
      name: json.job.name,
      cronExpression: json.job.cronExpression,
      timezone: json.job.timezone,
      enabled: json.job.enabled,
    });
    setOriginalFilename(json.job.originalFilename);
    setRuns(json.runs || []);
    setLogs(json.logs || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [mode, jobId]);

  function update<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((current) => (current[key] === value ? current : { ...current, [key]: value }));
  }

  const updateCronExpression = useCallback((cron: string) => {
    setState((current) => (current.cronExpression === cron ? current : { ...current, cronExpression: cron }));
  }, []);

  function payload() {
    const formData = new FormData();
    formData.set("name", state.name);
    formData.set("cronExpression", state.cronExpression);
    formData.set("timezone", state.timezone);
    formData.set("enabled", String(state.enabled));
    if (file) formData.set("file", file);
    return formData;
  }

  async function save() {
    setMessage("");
    setError("");
    if (mode === "create" && !file) {
      setError("File Python wajib diupload.");
      return;
    }
    if (file && !file.name.toLowerCase().endsWith(".py")) {
      setError("File harus berekstensi .py.");
      return;
    }

    setSaving(true);
    const response = await fetch(mode === "create" ? "/api/python-jobs" : `/api/python-jobs/${jobId}`, {
      method: mode === "create" ? "POST" : "PUT",
      body: payload(),
    });
    setSaving(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Gagal menyimpan Python job.");
      return;
    }
    setMessage("Python job berhasil disimpan.");
    if (mode === "create") {
      router.push(`/dashboard/python-jobs/${json.job.id}`);
      return;
    }
    setFile(null);
    setOriginalFilename(json.job.originalFilename);
    router.refresh();
    load();
  }

  async function runNow() {
    if (!jobId) return;
    setRunning(true);
    setMessage("");
    setError("");
    setProgressLogs([]);
    setRunDone(null);

    const response = await fetch(`/api/python-jobs/${jobId}/run`, { method: "POST" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRunning(false);
      setError(json.error || "Run gagal.");
      return;
    }

    window.setTimeout(() => {
      const sse = new EventSource(`/api/python-jobs/${jobId}/run-stream`);
      sse.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "log") {
          setProgressLogs((prev) => [...prev, { id: data.id, level: data.level, stream: data.stream, message: data.message }]);
        } else if (data.type === "run-done") {
          setRunDone({ status: data.status, errorSummary: data.errorSummary });
          setRunning(false);
          setMessage(data.status === "success" ? "Run selesai." : "Run gagal.");
          sse.close();
          load();
        } else if (data.type === "no-run") {
          setRunning(false);
          sse.close();
          load();
        }
      };
      sse.onerror = () => {
        sse.close();
        setRunning(false);
        load();
      };
    }, 250);
  }

  function levelVariant(value: string) {
    if (value === "success") return "success";
    if (value === "error") return "destructive";
    if (value === "warning") return "warning";
    return "muted";
  }

  if (loading) return <p className="text-sm text-muted-foreground">Memuat Python job...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            {mode === "create" ? "Buat Python Job" : state.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Upload script Python dan atur jadwal otomatis.</p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && (
            <Button variant="outline" onClick={runNow} disabled={running}>
              <Play className="h-4 w-4" />
              {running ? "Menjalankan..." : "Run Now"}
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="h-5 w-5 text-primary" />
                Script Python
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Job</Label>
                <Input value={state.name} onChange={(event) => update("name", event.target.value)} placeholder="Contoh: Sinkronisasi Report Harian" />
              </div>
              <div className="space-y-2">
                <Label>File .py</Label>
                <Input type="file" accept=".py,text/x-python,text/plain" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">
                  {file ? `File baru: ${file.name}` : originalFilename ? `File aktif: ${originalFilename}` : "Upload file .py."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Jadwal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Jadwal (Crontab)</Label>
                <CronBuilder value={state.cronExpression} onChange={updateCronExpression} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={state.timezone} placeholder="Asia/Jakarta" disabled />
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
              <p className="text-xs text-muted-foreground">Setiap run dibatasi timeout 10 menit. Output stdout dan stderr disimpan sebagai log.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Aksi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mode === "create" ? (
                <p className="text-sm text-muted-foreground">Simpan job dulu untuk menjalankan test.</p>
              ) : (
                <Button className="w-full justify-start" disabled={running} onClick={runNow}>
                  <Play className="h-4 w-4" />
                  {running ? "Menjalankan..." : "Run Now"}
                </Button>
              )}
            </CardContent>
          </Card>

          {(progressLogs.length > 0 || running) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${running ? "animate-pulse bg-amber-500" : runDone?.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                  {running ? "Sedang berjalan..." : runDone?.status === "success" ? "Selesai" : "Gagal"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
                  {progressLogs.map((log) => (
                    <div key={log.id} className={log.level === "error" ? "text-red-600 dark:text-red-300" : log.level === "warning" ? "text-amber-600 dark:text-amber-300" : log.level === "success" ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"}>
                      <span className="mr-2 select-none">[{log.stream}]</span>
                      <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{log.message}</span>
                    </div>
                  ))}
                  {running && <div className="animate-pulse text-muted-foreground">_</div>}
                </div>
                {runDone?.errorSummary && (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{runDone.errorSummary}</p>
                )}
              </CardContent>
            </Card>
          )}

          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Run Terakhir</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {runs.slice(0, 5).map((run) => (
                  <div key={run.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={levelVariant(run.status === "success" ? "success" : run.status === "failed" ? "error" : "info")}>
                        {run.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{run.source}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</p>
                    {run.exitCode !== null ? <p className="mt-1 text-xs text-muted-foreground">Exit code: {run.exitCode}</p> : null}
                    {run.errorSummary ? <p className="mt-2 text-xs text-red-600 dark:text-red-300">{run.errorSummary}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  Log Terbaru
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {logs.slice(0, 20).map((log) => (
                    <div key={log.id} className="rounded-md border p-2 text-xs">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Badge variant={levelVariant(log.level)}>{log.stream}</Badge>
                        <span className="text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap font-mono text-foreground [overflow-wrap:anywhere]">{log.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
