"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock3, Filter, Loader2, MessageSquare, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { ProjectDto, TelegramRequestDto } from "@/types/dashboard";

type RequestsPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

const statusLabels: Record<string, string> = {
  all: "Semua",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function statusVariant(status: string): "success" | "destructive" | "warning" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
}

function requesterName(request: TelegramRequestDto) {
  const display = [request.firstName, request.lastName].filter(Boolean).join(" ").trim();
  if (display) return display;
  if (request.username) return `@${request.username}`;
  return request.userId || request.chatId;
}

function picText(request: TelegramRequestDto) {
  return [request.picName, request.picNik, request.picUnit].filter(Boolean).join(" / ") || "-";
}

export function TelegramApprovalsClient() {
  const [requests, setRequests] = useState<TelegramRequestDto[]>([]);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<RequestsPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pendingCount = useMemo(() => requests.filter((request) => request.status === "pending").length, [requests]);

  async function load() {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    query.set("status", status);
    query.set("page", String(page));
    const response = await fetch(`/api/telegram-requests?${query.toString()}`, { cache: "no-store" });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Gagal memuat request Telegram.");
      return;
    }
    setRequests(json.requests ?? []);
    if (json.pagination) setPagination(json.pagination);
  }

  useEffect(() => {
    load();
  }, [status, page]);

  function updateStatus(value: string) {
    setStatus(value);
    setPage(1);
  }

  async function approve(request: TelegramRequestDto) {
    setBusyId(request.id);
    setMessage("");
    setError("");
    const response = await fetch(`/api/telegram-requests/${request.id}/approve`, { method: "POST" });
    const json: { error?: string; project?: ProjectDto } = await response.json().catch(() => ({}));
    setBusyId(null);
    if (!response.ok) {
      setError(json.error || "Gagal approve request.");
      return;
    }
    setMessage(`Request #${request.id} disetujui. Project ${json.project?.name ?? request.projectName ?? ""} dibuat.`);
    await load();
  }

  async function reject(request: TelegramRequestDto) {
    setBusyId(request.id);
    setMessage("");
    setError("");
    const reason = rejectReasons[request.id] ?? "";
    const response = await fetch(`/api/telegram-requests/${request.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = await response.json().catch(() => ({}));
    setBusyId(null);
    if (!response.ok) {
      setError(json.error || "Gagal reject request.");
      return;
    }
    setMessage(`Request #${request.id} ditolak.`);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review request provisioning dari Telegram sebelum menjadi project aktif.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-white/70 bg-card p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_30px_rgba(127,29,29,0.1)] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_30px_rgba(0,0,0,0.28)]">
          {Object.entries(statusLabels).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => updateStatus(value)}
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-all ${
                status === value
                  ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_14px_rgba(185,28,28,0.24)]"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-white/80 bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_38px_rgba(127,29,29,0.08)] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_38px_rgba(0,0,0,0.3)]">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Pending di halaman ini</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{pendingCount}</p>
        </div>
        <div className="rounded-lg border border-white/80 bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_38px_rgba(127,29,29,0.08)] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_38px_rgba(0,0,0,0.3)]">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Filter</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{statusLabels[status]}</p>
        </div>
        <div className="rounded-lg border border-white/80 bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_38px_rgba(127,29,29,0.08)] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_38px_rgba(0,0,0,0.3)]">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Total hasil</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{pagination.total}</p>
        </div>
      </div>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-lg border border-white/80 bg-card p-6 text-sm text-muted-foreground shadow-soft">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Memuat request Telegram...
          </div>
        ) : null}
        {!loading && requests.length === 0 ? (
          <div className="rounded-lg border border-white/80 bg-card p-6 text-sm text-muted-foreground shadow-soft">
            Belum ada request pada filter ini.
          </div>
        ) : null}
        {requests.map((request) => {
          const isPending = request.status === "pending";
          const isBusy = busyId === request.id;
          return (
            <section
              key={request.id}
              className="rounded-lg border border-white/80 bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_18px_42px_rgba(127,29,29,0.1)] transition-shadow hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_48px_rgba(127,29,29,0.14)] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.32)]"
            >
              <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDateTime(request.createdAt)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
                    {request.projectName || "Project tanpa nama"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    PIC: {picText(request)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    Pengirim: {requesterName(request)} - Chat: {request.chatTitle || request.chatId}
                  </p>
                </div>

                <dl className="grid gap-3 rounded-md border border-input bg-muted/40 p-3 text-sm shadow-[inset_0_1px_4px_rgba(15,23,42,0.05)] md:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Group WA</dt>
                    <dd className="mt-1 text-foreground [overflow-wrap:anywhere]">{request.groupIds.join(", ") || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Schedule</dt>
                    <dd className="mt-1 text-foreground [overflow-wrap:anywhere]">{request.cronExpression || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Sheet</dt>
                    <dd className="mt-1 text-foreground [overflow-wrap:anywhere]">{request.gid || "-"} - {request.cellRange || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Project hasil</dt>
                    <dd className="mt-1 text-foreground [overflow-wrap:anywhere]">{request.project?.name || "-"}</dd>
                  </div>
                </dl>

                <div className="flex min-w-48 flex-col gap-2">
                  {isPending ? (
                    <>
                      <Button
                        className="shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_16px_rgba(185,28,28,0.2)] active:translate-y-px active:shadow-[inset_0_2px_6px_rgba(127,29,29,0.28)]"
                        disabled={isBusy}
                        onClick={() => approve(request)}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Approve
                      </Button>
                      <Input
                        value={rejectReasons[request.id] ?? ""}
                        onChange={(event) => setRejectReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                        placeholder="Alasan reject"
                      />
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_12px_rgba(127,29,29,0.08)] active:translate-y-px dark:border-red-900/70 dark:text-red-300"
                        disabled={isBusy}
                        onClick={() => reject(request)}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        Reject
                      </Button>
                    </>
                  ) : (
                    <div className="rounded-md border border-input bg-muted/40 p-3 text-sm text-muted-foreground">
                      <ShieldCheck className="mb-2 h-4 w-4" />
                      {request.status === "approved" ? "Sudah disetujui." : request.rejectionReason || request.validationError || "Sudah ditolak."}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t pt-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  onClick={() => setExpanded((current) => ({ ...current, [request.id]: !current[request.id] }))}
                >
                  <MessageSquare className="h-4 w-4" />
                  Raw Telegram message
                  {expanded[request.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expanded[request.id] ? (
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs text-foreground shadow-[inset_0_2px_8px_rgba(15,23,42,0.08)]">
                    {request.rawMessage}
                  </pre>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {pagination.total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(pagination.page - 1) * pagination.pageSize + 1}-
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total} request
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
    </div>
  );
}
