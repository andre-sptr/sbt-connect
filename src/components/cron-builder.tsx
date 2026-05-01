"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Frequency = "daily" | "weekly" | "monthly" | "custom";

const DAYS = [
  { label: "Sen", value: "1" },
  { label: "Sel", value: "2" },
  { label: "Rab", value: "3" },
  { label: "Kam", value: "4" },
  { label: "Jum", value: "5" },
  { label: "Sab", value: "6" },
  { label: "Min", value: "0" },
];

function buildCron(freq: Frequency, hour: number, minute: number, days: string[], dayOfMonth: number): string {
  const m = minute.toString().padStart(2, "0");
  const h = hour.toString();
  if (freq === "daily") return `${m} ${h} * * *`;
  if (freq === "weekly") {
    const d = days.length === 0 ? "*" : days.sort((a, b) => Number(a) - Number(b)).join(",");
    return `${m} ${h} * * ${d}`;
  }
  if (freq === "monthly") return `${m} ${h} ${dayOfMonth} * *`;
  return "";
}

function humanReadable(freq: Frequency, hour: number, minute: number, days: string[], dayOfMonth: number): string {
  const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  const dayNames = days.map((v) => DAYS.find((d) => d.value === v)?.label ?? v).join(", ");
  if (freq === "daily") return `Setiap hari pukul ${time} WIB`;
  if (freq === "weekly") {
    if (days.length === 0) return `Setiap hari pukul ${time} WIB`;
    if (days.length === 7) return `Setiap hari pukul ${time} WIB`;
    return `Setiap ${dayNames} pukul ${time} WIB`;
  }
  if (freq === "monthly") return `Setiap tanggal ${dayOfMonth} pukul ${time} WIB`;
  return "Mode custom — isi cron expression manual.";
}

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const [freq, setFreq] = useState<Frequency>("daily");
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<string[]>(["1", "2", "3", "4", "5"]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [customCron, setCustomCron] = useState(value || "");

  // Sync outward
  useEffect(() => {
    if (freq === "custom") {
      onChange(customCron);
    } else {
      const cron = buildCron(freq, hour, minute, days, dayOfMonth);
      onChange(cron);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, hour, minute, days, dayOfMonth, customCron]);

  function toggleDay(d: string) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  const humanText = freq !== "custom" ? humanReadable(freq, hour, minute, days, dayOfMonth) : "";
  const displayCron = freq === "custom" ? customCron : buildCron(freq, hour, minute, days, dayOfMonth);

  return (
    <div className="space-y-3">
      {/* Frekuensi */}
      <div className="flex flex-wrap gap-2">
        {(["daily", "weekly", "monthly", "custom"] as Frequency[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFreq(f)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              freq === f
                ? "border-red-700 bg-red-700 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-700"
            }`}
          >
            {{ daily: "Harian", weekly: "Mingguan", monthly: "Bulanan", custom: "Custom" }[f]}
          </button>
        ))}
      </div>

      {/* Jam & Menit */}
      {freq !== "custom" && (
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <Label>Jam</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
            />
          </div>
          <div className="space-y-1 flex-1">
            <Label>Menit</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
            />
          </div>
          {freq === "monthly" && (
            <div className="space-y-1 flex-1">
              <Label>Tanggal</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(28, Number(e.target.value))))}
              />
            </div>
          )}
        </div>
      )}

      {/* Hari (weekly) */}
      {freq === "weekly" && (
        <div className="space-y-2">
          <Label>Hari</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`rounded-md border px-3 py-1 text-sm font-medium transition-colors ${
                  days.includes(d.value)
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-700"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom input */}
      {freq === "custom" && (
        <div className="space-y-1">
          <Label>Cron Expression</Label>
          <Input
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="Contoh: 0 8 * * *"
          />
          <a
            href="https://crontab.guru"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Cek di crontab.guru
          </a>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        {humanText && <p className="text-slate-600">{humanText}</p>}
        <p className="font-mono text-xs text-slate-400 mt-0.5">{displayCron || "—"}</p>
      </div>
    </div>
  );
}
