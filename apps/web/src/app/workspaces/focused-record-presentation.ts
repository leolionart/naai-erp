import { recordPartyId, relationshipIdList } from "./focused-record-relationships";

type Row = Record<string, unknown>;
export type RevenuePresentation = Readonly<{
  id: string;
  source: "documents" | "recognition";
  customerId: string;
  customerName: string;
  projectIds: readonly string[];
  projectNames: readonly string[];
  activityDate: string;
  amountMinor: string;
  currency: string;
  state: string;
  description: string;
}>;

const text = (row: Row | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = row?.[key] ?? row?.[snake];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
};

export function presentRevenueRecord(
  row: Row,
  source: "documents" | "recognition",
  projects: readonly Row[],
  parties: readonly Row[],
): RevenuePresentation {
  const projectIds = relationshipIdList(row, "projectId");
  const projectNames = projectIds.map((projectId) => {
    const project = projects.find((candidate) => text(candidate, "id") === projectId);
    return project ? text(project, "name", "code") || projectId : projectId;
  });
  const customerId = recordPartyId(row, projects) || text(row, "customerPartyId");
  const party = parties.find((candidate) => text(candidate, "id") === customerId);
  return {
    id: text(row, "id"),
    source,
    customerId,
    customerName:
      text(row, "customerName") || text(party, "displayName", "legalName") || customerId || "—",
    projectIds,
    projectNames,
    activityDate:
      source === "recognition"
        ? text(row, "effectiveOn", "recognitionDate")
        : text(row, "documentDate", "issueDate"),
    amountMinor: source === "recognition" ? text(row, "amountMinor") : text(row, "grossMinor"),
    currency: text(row, "currency") || "VND",
    state: text(row, "state"),
    description: text(row, "reason", "businessPurpose"),
  };
}
