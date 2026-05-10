"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const TEMPLATES = [
  {
    label: "📊 Reporting Harian",
    value: "*Laporan {projectName}*\n📅 {date}\n_Dikirim otomatis oleh SBT Connect_",
  },
  {
    label: "📅 Weekly Summary",
    value: "*Weekly Summary — {projectName}*\nPeriode: {week}, {month}\n\n_Laporan mingguan dikirim otomatis._",
  },
  {
    label: "📋 Rekap Singkat",
    value: "Rekap {projectName} — {datetime}",
  },
  {
    label: "📢 Pengumuman Formal",
    value: "Kepada Yth. Anggota Grup,\n\nBerikut laporan *{projectName}* per {date}.\n\nMohon diperhatikan.\n\n_SBT Connect_",
  },
  {
    label: "🗓️ Laporan Harian dengan Hari",
    value: "*{projectName}*\n{weekday}, {date} — {time} WIB\n_Run #{runCount} hari ini_",
  },
  {
    label: "📆 Laporan Bulanan / Quarterly",
    value: "*Laporan {projectName}*\nPeriode: {month} — {quarter}\n📅 {date}\n\n_Dikirim otomatis_",
  },
];

/** Token yang tersedia untuk caption */
export const CAPTION_TOKENS = [
  { token: "{projectName}", desc: "Nama project" },
  { token: "{date}", desc: "Tanggal panjang (mis. 10 Mei 2025)" },
  { token: "{datetime}", desc: "Tanggal + jam (mis. 10 Mei 2025, 08.00)" },
  { token: "{time}", desc: "Jam saja (mis. 08.00)" },
  { token: "{weekday}", desc: "Nama hari (mis. Senin)" },
  { token: "{week}", desc: "Minggu ke-N dalam bulan (mis. Minggu ke-2)" },
  { token: "{month}", desc: "Nama bulan (mis. Mei)" },
  { token: "{quarter}", desc: "Kuartal (mis. Q2)" },
  { token: "{runCount}", desc: "Run ke-N hari ini" },
];

interface CaptionTemplatesProps {
  onSelect: (caption: string) => void;
}

export function CaptionTemplates({ onSelect }: CaptionTemplatesProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
      >
        Template Caption
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-10 w-80 rounded-md border bg-card shadow-lg">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              className="block w-full border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-secondary"
              onClick={() => {
                onSelect(t.value);
                setOpen(false);
              }}
            >
              <p className="font-medium text-foreground">{t.label}</p>
              <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{t.value}</p>
            </button>
          ))}
          <div className="border-t px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Token tersedia:</p>
            <div className="flex flex-wrap gap-1">
              {CAPTION_TOKENS.map(({ token }) => (
                <code
                  key={token}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
                  title={CAPTION_TOKENS.find((t) => t.token === token)?.desc}
                >
                  {token}
                </code>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
