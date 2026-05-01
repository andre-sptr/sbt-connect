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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal text-foreground">
            <BarChart3 className="h-6 w-6 text-primary" />
            Statistik Projek
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Performa pengiriman 7 hari terakhir.</p>
        </div>
        <Link
          href={`/dashboard/projects/${id}`}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
          Edit Project
        </Link>
      </div>
      <ProjectStats projectId={projectId} />
    </div>
  );
}
