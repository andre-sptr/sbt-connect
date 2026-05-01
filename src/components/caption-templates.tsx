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
    value: "*Weekly Summary — {projectName}*\nPeriode: {date}\n\n_Laporan mingguan dikirim otomatis._",
  },
  {
    label: "📋 Rekap Singkat",
    value: "Rekap {projectName} — {datetime}",
  },
  {
    label: "📢 Pengumuman Formal",
    value: "Kepada Yth. Anggota Grup,\n\nBerikut laporan *{projectName}* per {date}.\n\nMohon diperhatikan.\n\n_SBT Connect_",
  },
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
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-700 transition-colors"
      >
        Template Caption
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-10 w-72 rounded-md border bg-white shadow-lg">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              className="block w-full px-4 py-3 text-left text-sm hover:bg-red-50 border-b last:border-0"
              onClick={() => {
                onSelect(t.value);
                setOpen(false);
              }}
            >
              <p className="font-medium text-slate-800">{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-500 line-clamp-2 whitespace-pre-line">{t.value}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
