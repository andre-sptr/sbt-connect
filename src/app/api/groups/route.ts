import { requireApiSession } from "@/lib/auth";
import { filterAllowedGroups, listCachedGroups, saveCachedGroups } from "@/lib/group-cache";
import { fetchWahaGroupsFromApi } from "@/lib/waha";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const requestedPage = searchParams.get("page");
  const page = Math.max(1, parseInt(requestedPage || "1", 10) || 1);
  const groups = await listCachedGroups(search);
  const pagedGroups = requestedPage ? groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : groups;
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));

  return Response.json({
    groups: pagedGroups.map((group) => ({
      id: group.remote,
      name: group.name,
      refreshedAt: group.refreshedAt,
    })),
    ...(requestedPage
      ? {
          pagination: {
            page,
            pageSize: PAGE_SIZE,
            total: groups.length,
            totalPages,
            hasPreviousPage: page > 1,
            hasNextPage: page < totalPages,
          },
        }
      : {}),
  });
}

export async function POST() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const groups = filterAllowedGroups(await fetchWahaGroupsFromApi());
    const refreshedAt = new Date();

    await saveCachedGroups(groups, refreshedAt);

    return Response.json({ groups, refreshedAt, count: groups.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal mengambil grup WAHA." }, { status: 500 });
  }
}
