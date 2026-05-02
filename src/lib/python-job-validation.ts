import { z } from "zod";
import { getNextRunAt, validateCronExpression } from "@/lib/project-validation";

export const PYTHON_JOB_TIMEOUT_SECONDS = 600;

export const pythonJobSchema = z.object({
  name: z.string().trim().min(2, "Nama job wajib diisi."),
  originalFilename: z.string().trim().min(1, "File Python wajib diisi."),
  cronExpression: z.string().trim().min(5, "Cron expression wajib diisi."),
  timezone: z.string().trim().default("Asia/Jakarta"),
  enabled: z.boolean().default(true),
});

export type PythonJobInput = z.infer<typeof pythonJobSchema>;

export function validatePythonCronExpression(expression: string, timezone = "Asia/Jakarta") {
  return validateCronExpression(expression, timezone);
}

export function getPythonJobNextRunAt(expression: string, timezone = "Asia/Jakarta") {
  return getNextRunAt(expression, timezone);
}

export function validatePythonFilename(filename: string) {
  return filename.trim().toLowerCase().endsWith(".py");
}
