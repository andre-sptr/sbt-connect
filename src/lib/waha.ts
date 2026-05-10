import { getWahaConfig } from "@/lib/config";

export type WahaGroup = {
  id: string;
  name: string;
  refreshedAt?: Date;
};

type SerializedId = {
  remote?: unknown;
  _serialized?: unknown;
};

type WahaGroupResponseItem = {
  id?: SerializedId;
  name?: unknown;
  groupMetadata?: {
    subject?: unknown;
    id?: SerializedId;
  };
  lastMessage?: {
    id?: SerializedId;
    _data?: {
      id?: {
        remote?: unknown | SerializedId;
      };
    };
  };
};

function normalizeRemote(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "_serialized" in value) {
    const serialized = (value as { _serialized?: unknown })._serialized;
    return typeof serialized === "string" ? serialized : "";
  }
  return "";
}

function extractGroup(item: WahaGroupResponseItem): WahaGroup | null {
  const name =
    (typeof item.name === "string" && item.name.trim()) ||
    (typeof item.groupMetadata?.subject === "string" && item.groupMetadata.subject.trim()) ||
    "(Tanpa nama)";

  const remote =
    normalizeRemote(item.id?.remote) ||
    normalizeRemote(item.id?._serialized) ||
    normalizeRemote(item.groupMetadata?.id?.remote) ||
    normalizeRemote(item.groupMetadata?.id?._serialized) ||
    normalizeRemote(item.lastMessage?.id?.remote) ||
    normalizeRemote(item.lastMessage?._data?.id?.remote);

  if (!remote.endsWith("@g.us")) return null;
  return { id: remote, name };
}

export async function fetchWahaGroupsFromApi(): Promise<WahaGroup[]> {
  const config = getWahaConfig();
  const response = await fetch(`${config.url.replace(/\/$/, "")}/api/${config.session}/groups`, {
    headers: {
      Accept: "application/json",
      "X-Api-Key": config.apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`WAHA groups request failed: ${response.status}`);
  }

  const payload = (await response.json()) as WahaGroupResponseItem[];
  const unique = new Map<string, WahaGroup>();
  for (const item of payload) {
    const group = extractGroup(item);
    if (group) unique.set(group.id, group);
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Cek apakah bot WA sudah menjadi member di grup-grup tertentu
 * dengan mengambil daftar grup dari WAHA API (bot hanya bisa melihat
 * grup yang ia ikuti).
 */
export async function checkBotGroupMembership(
  groupIds: string[]
): Promise<{ groupId: string; isMember: boolean }[]> {
  if (groupIds.length === 0) return [];

  let allGroups: WahaGroup[];
  try {
    allGroups = await fetchWahaGroupsFromApi();
  } catch {
    // Jika API gagal, anggap semua belum jadi member
    return groupIds.map((groupId) => ({ groupId, isMember: false }));
  }

  const memberSet = new Set(allGroups.map((g) => g.id));
  return groupIds.map((groupId) => ({ groupId, isMember: memberSet.has(groupId) }));
}
