import { ProjectEditor } from "@/components/project-editor";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const timezone = process.env.TIMEZONE?.trim() || "Asia/Jakarta";

  return <ProjectEditor mode="edit" projectId={Number(id)} defaultTimezone={timezone} />;
}
