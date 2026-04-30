import { prisma } from "@/lib/prisma";

export async function writeLog(input: {
  projectId?: number;
  runId?: number;
  level?: "info" | "success" | "warning" | "error";
  message: string;
}) {
  await prisma.log.create({
    data: {
      projectId: input.projectId,
      runId: input.runId,
      level: input.level || "info",
      message: input.message,
    },
  });
}
