import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WahaGroup } from "@/lib/waha";

export const excludedGroupIds = ["120363424766297041@g.us"];

export function filterAllowedGroups(groups: WahaGroup[]) {
  return groups.filter((group) => !excludedGroupIds.includes(group.id));
}

type CachedGroupRow = {
  id: number;
  remote: string;
  name: string;
  refreshedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export async function listCachedGroups(search?: string) {
  const keyword = search?.trim();
  if (keyword) {
    const like = `%${keyword}%`;
    return prisma.$queryRaw<CachedGroupRow[]>`
      SELECT id, remote, name, refreshedAt, createdAt, updatedAt
      FROM "CachedGroup"
      WHERE (name LIKE ${like} OR remote LIKE ${like})
        AND remote NOT IN (${Prisma.join(excludedGroupIds)})
      ORDER BY name ASC
    `;
  }

  return prisma.$queryRaw<CachedGroupRow[]>`
    SELECT id, remote, name, refreshedAt, createdAt, updatedAt
    FROM "CachedGroup"
    WHERE remote NOT IN (${Prisma.join(excludedGroupIds)})
    ORDER BY name ASC
  `;
}

export async function saveCachedGroups(groups: WahaGroup[], refreshedAt: Date) {
  const allowedGroups = filterAllowedGroups(groups);
  await prisma.$executeRaw`
    DELETE FROM "CachedGroup"
    WHERE remote IN (${Prisma.join(excludedGroupIds)})
  `;

  if (allowedGroups.length === 0) return;

  await prisma.$transaction(
    allowedGroups.map((group) =>
      prisma.$executeRaw`
        INSERT INTO "CachedGroup" (remote, name, refreshedAt, createdAt, updatedAt)
        VALUES (${group.id}, ${group.name}, ${refreshedAt}, ${refreshedAt}, ${refreshedAt})
        ON CONFLICT(remote) DO UPDATE SET
          name = excluded.name,
          refreshedAt = excluded.refreshedAt,
          updatedAt = excluded.updatedAt
      `
    )
  );
}
