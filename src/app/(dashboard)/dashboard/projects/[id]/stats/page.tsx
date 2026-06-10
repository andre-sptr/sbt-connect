import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { ProjectStats } from "@/components/project-stats";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectStatsPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Statistik Projek"
        description="Performa pengiriman 7 hari terakhir."
        backHref={`/dashboard/projects/${id}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: "Statistik" },
        ]}
        actions={<Button asChild variant="outline">
          <Link href={`/dashboard/projects/${id}`}>
            <Pencil className="h-4 w-4" />
            Edit Project
          </Link>
        </Button>}
      />
      <ProjectStats projectId={projectId} />
    </div>
  );
}
