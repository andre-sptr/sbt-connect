import { requireApiSession } from "@/lib/auth";
import { installPythonDependency, listPythonDependencies } from "@/lib/python-venv";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  try {
    return Response.json(await listPythonDependencies());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Gagal membaca dependency Python." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as { packageSpec?: string } | null;
  if (!body?.packageSpec) {
    return Response.json({ error: "Nama package wajib diisi." }, { status: 400 });
  }

  try {
    const install = await installPythonDependency(body.packageSpec);
    const dependencies = await listPythonDependencies();
    return Response.json({ install, ...dependencies }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Install dependency gagal." },
      { status: 500 }
    );
  }
}
