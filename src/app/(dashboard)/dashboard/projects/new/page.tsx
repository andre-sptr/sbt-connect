import { ProjectEditor } from "@/components/project-editor";

export default function NewProjectPage() {
  const timezone = process.env.TIMEZONE?.trim() || "Asia/Jakarta";

  return <ProjectEditor mode="create" defaultTimezone={timezone} />;
}
