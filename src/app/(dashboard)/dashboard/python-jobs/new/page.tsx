import { PythonJobEditor } from "@/components/python-job-editor";

export default function NewPythonJobPage() {
  const timezone = process.env.TIMEZONE?.trim() || "Asia/Jakarta";

  return <PythonJobEditor mode="create" defaultTimezone={timezone} />;
}
