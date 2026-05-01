import Link from "next/link";
import { BarChart3, Pencil } from "lucide-react";
import { ProjectStats } from "@/components/project-stats";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectStatsPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-red-700" />
            Statistik Projek
          </h1>
          <p className="mt-1 text-sm text-slate-600">Performa pengiriman 7 hari terakhir.</p>
        </div>
        <Link
          href={`/dashboard/projects/${id}`}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-red-200 hover:text-red-700 transition-colors"
        >
          <Pencil className="h-4 w-4" />
          Edit Project
        </Link>
      </div>
      <ProjectStats projectId={projectId} />
    </div>
  );
}
