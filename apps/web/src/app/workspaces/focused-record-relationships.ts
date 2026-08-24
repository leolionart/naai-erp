type Row = Record<string, unknown>;

function text(row: Row | undefined, ...keys: string[]) {
  for (const key of keys) {
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = row?.[key] ?? row?.[snake];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function idList(row: Row | undefined, key: string) {
  const value = row?.[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function relationshipIdList(row: Row | undefined, key: "projectId" | "contractId") {
  const direct = idList(row, `${key}s`);
  if (direct.length) return direct;

  const rootId = text(row, key);
  if (rootId) return [rootId];

  const ids = new Set<string>();
  const lines = Array.isArray(row?.lines) ? (row.lines as Row[]) : [];
  for (const line of lines) {
    const lineDimensions = line.dimensions as Row | undefined;
    const lineId = text(lineDimensions, key);
    if (lineId) ids.add(lineId);

    const allocations = Array.isArray(line.allocations) ? (line.allocations as Row[]) : [];
    for (const allocation of allocations) {
      const allocationDimensions = allocation.dimensions as Row | undefined;
      const allocationId = text(allocationDimensions, key);
      if (allocationId) ids.add(allocationId);
    }
  }
  return [...ids];
}

export function recordPartyId(row: Row, projects: readonly Row[]) {
  const direct = text(row, "partyId", "payeePartyId", "employeePartyId");
  if (direct) return direct;

  for (const projectId of relationshipIdList(row, "projectId")) {
    const project = projects.find((candidate) => text(candidate, "id") === projectId);
    const clientPartyId = text(project, "clientPartyId");
    if (clientPartyId) return clientPartyId;
  }
  return "";
}
