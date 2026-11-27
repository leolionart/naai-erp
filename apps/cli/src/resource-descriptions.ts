// ERP-998: `naai-erp discovery describe --key <resource>` returns a few KB instead of the 330 KB OpenAPI.
interface ResourceDescription {
  resource: string;
  list: { defaultLimit: number; maxLimit: number; order: string; summaryFields: string[] };
  filters: string[];
  actions: string[];
  notes: string[];
}

const COMMON_NOTES = [
  "Lists are keyset paginated: follow data.nextCursor; data.total only with --include-total.",
  "Use --all --output <file> for large exports; never print a whole table to stdout.",
];

export const RESOURCE_DESCRIPTIONS: Record<string, ResourceDescription> = {
  expenses: {
    resource: "expenses",
    list: {
      defaultLimit: 50,
      maxLimit: 200,
      order: "expenseDate desc, id",
      summaryFields: [
        "id",
        "expense_date",
        "state",
        "expense_class",
        "payee_party_id",
        "business_purpose",
        "gross_minor",
        "currency",
        "category",
        "paymentMethod",
        "draftReasons",
      ],
    },
    filters: ["state", "class", "payeePartyId", "fundingTreatment", "startsOn", "endsOn"],
    actions: ["list", "count", "summary", "get", "create", "update", "review", "post"],
    notes: [
      ...COMMON_NOTES,
      "count and summary accept the same filters; summary needs groupBy=month|state|class|payee|category (max 120 groups).",
    ],
  },
  "commercial-documents": {
    resource: "commercial-documents",
    list: {
      defaultLimit: 50,
      maxLimit: 200,
      order: "documentDate desc, id",
      summaryFields: [
        "id",
        "type",
        "state",
        "document_number",
        "party_id",
        "document_date",
        "gross_minor",
        "currency",
        "category",
      ],
    },
    filters: ["type", "state", "partyId", "projectId", "startsOn", "endsOn"],
    actions: ["list", "count", "summary", "get", "create", "update", "issue", "post", "void"],
    notes: [
      ...COMMON_NOTES,
      "Pass --view summary to drop embedded lines and allocations.",
      "count and summary accept the same filters; summary needs groupBy=month|state|type|party (max 120 groups).",
    ],
  },
  journals: {
    resource: "journals",
    list: {
      defaultLimit: 50,
      maxLimit: 200,
      order: "journalDate desc, id",
      summaryFields: ["id", "journal_date", "description", "state", "currency"],
    },
    filters: [],
    actions: ["list", "get", "create", "approve", "post", "reverse"],
    notes: [...COMMON_NOTES, "Pass --view summary to drop embedded lines."],
  },
};

export function describeResource(key: string | undefined) {
  if (!key) return { resources: Object.keys(RESOURCE_DESCRIPTIONS) };
  const description = RESOURCE_DESCRIPTIONS[key];
  if (!description) throw new Error(`No description for resource: ${key}`);
  return description;
}

/** Keeps only the OpenAPI paths that carry the given tag (plus shared components). */
export function filterOpenApiByTag(
  spec: { paths?: Record<string, Record<string, unknown>> },
  tag: string,
) {
  const paths = Object.fromEntries(
    Object.entries(spec.paths ?? {}).filter(([, item]) =>
      Object.values(item).some((operation) =>
        (operation as { tags?: string[] })?.tags?.includes(tag),
      ),
    ),
  );
  return { ...spec, paths };
}
