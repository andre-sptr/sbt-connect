import { requireApiSession } from "@/lib/auth";
import { filterAllowedGroups, listCachedGroups, saveCachedGroups } from "@/lib/group-cache";
import { fetchWahaGroupsFromApi } from "@/lib/waha";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const groups = await listCachedGroups(search);

  return Response.json({
    groups: groups.map((group) => ({
      id: group.remote,
      name: group.name,
      refreshedAt: group.refreshedAt,
    })),
  });
}

export async function POST() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  try {
    const groups = filterAllowedGroups(await fetchWahaGroupsFromApi());
    const refreshedAt = new Date();

    await saveCachedGroups(groups, refreshedAt);

    return Response.json({ groups, refreshedAt, count: groups.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal mengambil grup WAHA." }, { status: 500 });
  }
}
