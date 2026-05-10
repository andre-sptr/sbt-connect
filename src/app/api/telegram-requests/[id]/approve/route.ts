import { requireApiSession } from "@/lib/auth";
import { approveTelegramRequest } from "@/lib/telegram-service";

type Context = { params: Promise<{ id: string }> };

function parseId(id: string) {
  const numericId = Number(id);
  return Number.isInteger(numericId) ? numericId : null;
}

export async function POST(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const requestId = parseId(id);
  if (!requestId) return Response.json({ error: "ID request tidak valid." }, { status: 400 });

  try {
    const result = await approveTelegramRequest(requestId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal approve request." }, { status: 400 });
  }
}
