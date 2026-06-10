"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    setLoading(false);
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error || "Login gagal.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form className="space-y-4" action="/api/auth/login" method="post" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="username" name="username" className="pl-9" autoComplete="username" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="password" name="password" type="password" className="pl-9" autoComplete="current-password" required />
            </div>
          </div>
          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}
          <Button className="w-full" disabled={loading}>
            {loading ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
