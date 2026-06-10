"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, UserX, KeyRound, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { SkeletonLines } from "@/components/ui/skeleton";

type User = {
  id: number;
  username: string;
  role: "admin" | "user";
  isActive: boolean;
  telegramChatId: string | null;
  createdAt: string;
  _count: { projects: number };
};

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

let toastId = 0;

export function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);

  // Per-user loading states
  const [resetting, setResetting] = useState<number | null>(null);
  const [deactivating, setDeactivating] = useState<number | null>(null);
  const [resending, setResending] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "reset" | "resend" | "deactivate"; user: User } | null>(null);

  // Copied password modal
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string } | null>(null);
  const [resetCreds, setResetCreds] = useState<{ username: string; password: string } | null>(null);

  function addToast(message: string, type: Toast["type"] = "info") {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Gagal memuat daftar user.");
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Gagal memuat.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat user.");
      setCreatedCreds({ username: data.user.username, password: data.password });
      setNewUsername("");
      setNewRole("user");
      setShowCreate(false);
      await fetchUsers();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Gagal.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function performReset(user: User) {
    setResetting(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal reset password.");
      setResetCreds({ username: user.username, password: data.password });
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Gagal.", "error");
    } finally {
      setResetting(null);
    }
  }

  async function performResend(user: User) {
    setResending(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/resend-credentials`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim ulang.");
      if (data.telegramSent === false && data.password) {
        setResetCreds({ username: user.username, password: data.password });
        addToast("Telegram gagal — password baru ditampilkan di layar.", "error");
      } else {
        addToast(`Kredensial dikirim ke Telegram ${user.username}.`, "success");
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Gagal.", "error");
    } finally {
      setResending(null);
    }
  }

  async function performDeactivate(user: User) {
    setDeactivating(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menonaktifkan.");
      addToast(`Akun "${user.username}" dinonaktifkan.`, "success");
      await fetchUsers();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Gagal.", "error");
    } finally {
      setDeactivating(null);
    }
  }

  async function confirmPendingAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.type === "reset") await performReset(action.user);
    if (action.type === "resend") await performResend(action.user);
    if (action.type === "deactivate") await performDeactivate(action.user);
  }

  function actionCopy() {
    if (!confirmAction) {
      return { title: "", description: "", confirmLabel: "" };
    }
    if (confirmAction.type === "reset") {
      return {
        title: "Reset password?",
        description: `Password baru untuk "${confirmAction.user.username}" akan dibuat dan ditampilkan sekali.`,
        confirmLabel: "Reset Password",
      };
    }
    if (confirmAction.type === "resend") {
      return {
        title: "Kirim ulang kredensial?",
        description: `Kredensial baru akan dikirim ke Telegram user "${confirmAction.user.username}".`,
        confirmLabel: "Kirim",
      };
    }
    return {
      title: "Nonaktifkan user?",
      description: `Akun "${confirmAction.user.username}" dan semua project miliknya akan dinonaktifkan.`,
      confirmLabel: "Nonaktifkan",
    };
  }

  const confirmText = actionCopy();

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Kelola User"
        description="Tambah, reset password, atau nonaktifkan akun pengguna."
        actions={<>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            <span className="sr-only">Refresh user</span>
          </Button>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <UserPlus className="h-4 w-4" />
            Tambah User
          </Button>
        </>}
      />

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border bg-card p-4 space-y-3"
        >
          <p className="text-sm font-medium text-foreground">Buat akun baru</p>
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="max-w-[200px]"
              required
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Membuat..." : "Buat"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Batal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Password acak akan dibuat dan ditampilkan sekali — catat sebelum menutup.
          </p>
        </form>
      )}

      {/* User table */}
      <div className="hidden rounded-lg border bg-card md:block md:overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Username</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Projects</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Telegram</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <SkeletonLines count={4} />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada user.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono font-medium">{user.username}</td>
                  <td className="px-4 py-3">
                    <Badge variant={user.role === "admin" ? "default" : "muted"}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? "success" : "muted"}>
                      {user.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user._count.projects}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.telegramChatId ? "✓ Terhubung" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmAction({ type: "reset", user })}
                        disabled={!user.isActive || resetting === user.id}
                        title="Reset Password"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {resetting === user.id ? "..." : "Reset PW"}
                      </Button>
                      {user.telegramChatId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmAction({ type: "resend", user })}
                          disabled={!user.isActive || resending === user.id}
                          title="Kirim ulang kredensial via Telegram"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {resending === user.id ? "..." : "Kirim"}
                        </Button>
                      )}
                      {user.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmAction({ type: "deactivate", user })}
                          disabled={deactivating === user.id}
                          title="Nonaktifkan user"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {deactivating === user.id ? "..." : "Nonaktifkan"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-lg border bg-card p-4">
            <SkeletonLines count={5} />
          </div>
        ) : null}
        {!loading && users.length === 0 ? (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Belum ada user.</div>
        ) : null}
        {!loading && users.map((user) => (
          <div key={user.id} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-mono text-sm font-semibold text-foreground">{user.username}</p>
                <p className="mt-1 text-xs text-muted-foreground">{user._count.projects} project</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={user.role === "admin" ? "default" : "muted"}>{user.role}</Badge>
                <Badge variant={user.isActive ? "success" : "muted"}>{user.isActive ? "Aktif" : "Nonaktif"}</Badge>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Telegram: {user.telegramChatId ? "Terhubung" : "Belum terhubung"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction({ type: "reset", user })}
                disabled={!user.isActive || resetting === user.id}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Reset PW
              </Button>
              {user.telegramChatId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmAction({ type: "resend", user })}
                  disabled={!user.isActive || resending === user.id}
                >
                  <Send className="h-3.5 w-3.5" />
                  Kirim
                </Button>
              )}
              {user.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmAction({ type: "deactivate", user })}
                  disabled={deactivating === user.id}
                >
                  <UserX className="h-3.5 w-3.5" />
                  Nonaktifkan
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Created credentials modal */}
      {createdCreds && (
        <CredentialsModal
          title="Akun berhasil dibuat"
          username={createdCreds.username}
          password={createdCreds.password}
          onClose={() => setCreatedCreds(null)}
        />
      )}

      {/* Reset credentials modal */}
      {resetCreds && (
        <CredentialsModal
          title="Password berhasil direset"
          username={resetCreds.username}
          password={resetCreds.password}
          onClose={() => setResetCreds(null)}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg px-4 py-3 text-sm shadow-lg max-w-sm",
              t.type === "success" && "bg-green-600 text-white",
              t.type === "error" && "bg-destructive text-destructive-foreground",
              t.type === "info" && "bg-card border text-foreground"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmText.title}
        description={confirmText.description}
        confirmLabel={confirmText.confirmLabel}
        destructive={confirmAction?.type === "deactivate"}
        loading={!!confirmAction && (resetting === confirmAction.user.id || resending === confirmAction.user.id || deactivating === confirmAction.user.id)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credentials modal
// ---------------------------------------------------------------------------

function CredentialsModal({
  title,
  username,
  password,
  onClose,
}: {
  title: string;
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl space-y-4">
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">
          Catat atau kirimkan kredensial berikut ke user. Password tidak bisa dilihat lagi setelah modal ini ditutup.
        </p>
        <div className="rounded-md border bg-muted/50 p-3 font-mono text-sm space-y-1">
          <div>Username: <span className="font-semibold">{username}</span></div>
          <div>Password: <span className="font-semibold">{password}</span></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
            {copied ? "✓ Tersalin" : "Salin"}
          </Button>
          <Button size="sm" className="flex-1" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
