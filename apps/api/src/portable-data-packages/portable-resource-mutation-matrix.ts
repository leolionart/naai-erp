import { MASTER_DATA_RESOURCES } from "../master-data/resource-registry.js";

export type PortableMutationAdapterKind =
  "master_data" | "commercial_document" | "expense" | "journal" | "read_only";

export type PortableMutationMatrixEntry = Readonly<{
  resourceType: string;
  adapter: PortableMutationAdapterKind;
  canonicalResource?: string;
  operations: readonly ("create" | "update" | "deactivate" | "cancel" | "reverse_replace")[];
  reason?: string;
}>;

const masterEntries = Object.entries(MASTER_DATA_RESOURCES).map(
  ([canonicalResource, definition]): PortableMutationMatrixEntry => ({
    resourceType: canonicalResource,
    adapter: "master_data",
    canonicalResource,
    operations: [
      ...(definition.writableColumns.length ? (["create"] as const) : []),
      ...(definition.mutableColumns.length ? (["update"] as const) : []),
      ...("deactivate" in definition && definition.deactivate ? (["deactivate"] as const) : []),
    ],
  }),
);

export const PORTABLE_RESOURCE_MUTATION_MATRIX: ReadonlyMap<string, PortableMutationMatrixEntry> =
  new Map([
    ...masterEntries.map((entry) => [entry.resourceType, entry] as const),
    [
      "commercial_documents",
      {
        resourceType: "commercial_documents",
        adapter: "commercial_document",
        operations: ["update", "cancel", "reverse_replace"],
      },
    ],
    [
      "expenses",
      {
        resourceType: "expenses",
        adapter: "expense",
        operations: ["update", "cancel", "reverse_replace"],
      },
    ],
    [
      "journal_entries",
      {
        resourceType: "journal_entries",
        adapter: "journal",
        operations: [],
        reason:
          "Journal reversal and replacement are not available as one atomic portable mutation",
      },
    ],
  ]);

export const portableMutationEntry = (resourceType: string): PortableMutationMatrixEntry =>
  PORTABLE_RESOURCE_MUTATION_MATRIX.get(resourceType) ?? {
    resourceType,
    adapter: "read_only",
    operations: [],
    reason: "No canonical lifecycle mutation service is registered for this exported resource",
  };

export const portableOperationHasAccountingEffect = (resourceType: string, operation: string) =>
  resourceType === "journal_entries" ||
  ((resourceType === "commercial_documents" || resourceType === "expenses") &&
    (operation === "cancel" || operation === "reverse_replace"));

export const portableBatchRequiresAtomicService = (
  mutations: readonly Readonly<{ resourceType: string; operation: string }>[],
) =>
  mutations.length > 1 &&
  mutations.some(({ resourceType, operation }) =>
    portableOperationHasAccountingEffect(resourceType, operation),
  );
