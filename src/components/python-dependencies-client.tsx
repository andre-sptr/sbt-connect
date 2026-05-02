"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, PackagePlus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PythonDependencyDto } from "@/types/dashboard";

type PythonDependenciesResponse = {
  venvPath: string;
  pythonPath: string;
  venvExists: boolean;
  packages: PythonDependencyDto[];
  install?: { packageSpec: string; output: string };
  error?: string;
};

export function PythonDependenciesClient() {
  const [packages, setPackages] = useState<PythonDependencyDto[]>([]);
  const [venvPath, setVenvPath] = useState("");
  const [pythonPath, setPythonPath] = useState("");
  const [venvExists, setVenvExists] = useState(false);
  const [packageSpec, setPackageSpec] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [installOutput, setInstallOutput] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/python-dependencies", { cache: "no-store" });
    setLoading(false);
    const json: PythonDependenciesResponse = await response.json().catch(() => ({ error: "Response tidak valid." } as PythonDependenciesResponse));
    if (!response.ok) {
      setError(json.error || "Gagal memuat dependency Python.");
      return;
    }
    setPackages(json.packages || []);
    setVenvPath(json.venvPath);
    setPythonPath(json.pythonPath);
    setVenvExists(json.venvExists);
  }

  useEffect(() => {
    load();
  }, []);

  async function installDependency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const spec = packageSpec.trim();
    if (!spec) return;

    setInstalling(true);
    setMessage("");
    setError("");
    setInstallOutput("");
    const response = await fetch("/api/python-dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageSpec: spec }),
    });
    setInstalling(false);
    const json: PythonDependenciesResponse = await response.json().catch(() => ({ error: "Response tidak valid." } as PythonDependenciesResponse));
    if (!response.ok) {
      setError(json.error || "Install dependency gagal.");
      return;
    }
    setPackages(json.packages || []);
    setVenvPath(json.venvPath);
    setPythonPath(json.pythonPath);
    setVenvExists(json.venvExists);
    setPackageSpec("");
    setMessage(`${json.install?.packageSpec || spec} berhasil diinstall.`);
    setInstallOutput(json.install?.output || "");
  }

  const filteredPackages = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return packages;
    return packages.filter((item) => item.name.toLowerCase().includes(query) || item.version.toLowerCase().includes(query));
  }, [packages, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Python Dependencies</h1>
          <p className="mt-1 text-sm text-muted-foreground">{packages.length} package tersedia di environment Python job.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading || installing}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Package Terinstall
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari package..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="rounded-md border">
              <div className="grid grid-cols-[minmax(0,1fr)_160px] bg-muted px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
                <span>Package</span>
                <span>Version</span>
              </div>
              {loading ? <p className="p-4 text-sm text-muted-foreground">Memuat dependency...</p> : null}
              {!loading && filteredPackages.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{venvExists ? "Tidak ada package yang cocok." : ".venv belum tersedia. Install package pertama untuk membuat .venv."}</p>
              ) : null}
              {filteredPackages.map((item) => (
                <div key={`${item.name}-${item.version}`} className="grid grid-cols-[minmax(0,1fr)_160px] gap-3 border-t px-4 py-3 text-sm">
                  <p className="font-medium text-foreground [overflow-wrap:anywhere]">{item.name}</p>
                  <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.version}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-primary" />
                Tambah Dependency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={installDependency}>
                <div className="space-y-2">
                  <Label>Package PyPI</Label>
                  <Input value={packageSpec} onChange={(event) => setPackageSpec(event.target.value)} placeholder="Contoh: pandas atau requests==2.32.3" />
                  <p className="text-xs text-muted-foreground">Install berjalan di `.venv` project.</p>
                </div>
                <Button className="w-full" disabled={installing || !packageSpec.trim()}>
                  <PackagePlus className="h-4 w-4" />
                  {installing ? "Menginstall..." : "Install"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={venvExists ? "success" : "warning"}>{venvExists ? "Aktif" : "Belum ada"}</Badge>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Venv path</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{venvPath || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Python executable</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{pythonPath || "-"}</p>
              </div>
            </CardContent>
          </Card>

          {installOutput ? (
            <Card>
              <CardHeader>
                <CardTitle>Output Install</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-foreground [overflow-wrap:anywhere]">{installOutput}</pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
