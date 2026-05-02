import { PythonJobEditor } from "@/components/python-job-editor";

type Props = { params: Promise<{ id: string }> };

export default async function PythonJobDetailPage({ params }: Props) {
  const { id } = await params;
  const timezone = process.env.TIMEZONE?.trim() || "Asia/Jakarta";

  return <PythonJobEditor mode="edit" jobId={Number(id)} defaultTimezone={timezone} />;
}
