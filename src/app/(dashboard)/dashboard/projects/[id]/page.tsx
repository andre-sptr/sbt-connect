import { ProjectEditor } from "@/components/project-editor";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  return <ProjectEditor mode="edit" projectId={Number(id)} />;
}
