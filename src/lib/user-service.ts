/**
 * user-service.ts
 *
 * User account management — DB operations.
 * Pure helpers (generatePassword, verifyPassword, hashPassword)
 * live in auth-utils.ts so they can be imported by tests without Next.js deps.
 */

import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, verifyPassword } from "@/lib/auth-utils";

export { generatePassword, verifyPassword };

export async function createUser(
  username: string,
  password: string,
  role: "admin" | "user" = "user"
) {
  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: { username, passwordHash, role },
  });
}

export async function resetPassword(userId: number): Promise<string> {
  const password = generatePassword(12);
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return password;
}

export async function getUserById(userId: number) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function getUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export async function deactivateUser(userId: number): Promise<void> {
  // Cascade: disable all user's projects so scheduled jobs stop running
  await prisma.$transaction([
    prisma.project.updateMany({
      where: { createdByUserId: userId },
      data: { enabled: false },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    }),
  ]);
}
