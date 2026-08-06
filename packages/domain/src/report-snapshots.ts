export const REPORT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const REPORT_SNAPSHOT_HASH_ALGORITHM = "sha256" as const;

export const ACCOUNTANT_REPORT_KINDS = [
  "profit_and_loss",
  "balance_sheet",
  "direct_cash_flow",
  "vat_reconciliation",
  "tax_expense_review",
] as const;

export type AccountantReportKind = (typeof ACCOUNTANT_REPORT_KINDS)[number];
export interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJsonValue | undefined;
}
export type CanonicalJsonArray = readonly CanonicalJsonValue[];
export type CanonicalJsonValue =
  null | boolean | number | string | bigint | CanonicalJsonArray | CanonicalJsonObject;
export type SnapshotReadiness = "review_required" | "final";
export type SnapshotMappingStatus = "mapped" | "unmapped" | "review_required";

export type SnapshotLedgerCutoff = Readonly<{
  throughDate: string;
  maxPostedAt: string;
  journalCount: number;
  lineCount: number;
  sourceFingerprint: string;
}>;

export type SnapshotMapping = Readonly<{
  sourceKey: string;
  targetKey?: string;
  mappingVersionId?: string;
  status: SnapshotMappingStatus;
  reason?: string;
}>;

export type SnapshotUnresolvedItem = Readonly<{
  code: string;
  severity: "warning" | "critical";
  sourceIds: readonly string[];
  message: string;
}>;

export type ReportSnapshot = Readonly<{
  schemaVersion: typeof REPORT_SNAPSHOT_SCHEMA_VERSION;
  id: string;
  version: number;
  organizationId: string;
  reportKind: AccountantReportKind;
  period: Readonly<{ startsOn?: string; endsOn?: string; asOfDate: string }>;
  dimensions: Readonly<Record<string, string>>;
  accountingBasis: string;
  framework?: string;
  formulaVersions: Readonly<Record<string, string>>;
  mappingVersions: Readonly<Record<string, string>>;
  ledgerCutoff: SnapshotLedgerCutoff;
  sourceManifest: readonly CanonicalJsonObject[];
  mappings: readonly SnapshotMapping[];
  unresolvedItems: readonly SnapshotUnresolvedItem[];
  state: "captured";
  readiness: SnapshotReadiness;
  canonicalRequestJson: string;
  canonicalResultJson: string;
  requestHash: string;
  resultHash: string;
  snapshotHash: string;
  previousSnapshotId?: string;
  previousSnapshotVersion?: number;
  createdAt: string;
  createdBy: string;
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const isoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be an ISO date`);
  return value;
};
const timestamp = (value: string, label: string) => {
  if (!value.includes("T") || Number.isNaN(Date.parse(value)))
    throw new Error(`${label} must be an ISO timestamp`);
  return value;
};
const sortedUnique = (values: readonly string[]) =>
  Object.freeze([...new Set(values.map((value) => required(value, "Snapshot source ID")))].sort());

export function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON does not support non-finite numbers");
    if (Object.is(value, -0)) return "0";
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Readonly<Record<string, CanonicalJsonValue | undefined>>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key]!)}`)
    .join(",")}}`;
}

// Small dependency-free SHA-256 implementation keeps the domain package portable.
export function sha256Hex(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = text.charCodeAt(++index);
      if (low < 0xdc00 || low > 0xdfff) throw new Error("Canonical JSON contains invalid UTF-16");
      const point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 63),
        0x80 | ((point >> 6) & 63),
        0x80 | (point & 63),
      );
    } else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 255);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 255);
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0);
    for (let i = 0; i < 16; i += 1)
      words[i] =
        ((bytes[offset + i * 4]! << 24) |
          (bytes[offset + i * 4 + 1]! << 16) |
          (bytes[offset + i * 4 + 2]! << 8) |
          bytes[offset + i * 4 + 3]!) >>>
        0;
    for (let i = 16; i < 64; i += 1) {
      const a = words[i - 15]!,
        b = words[i - 2]!;
      words[i] =
        (words[i - 16]! +
          (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) +
          words[i - 7]! +
          (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i += 1) {
      const t1 =
        (hh +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          k[i]! +
          words[i]!) >>>
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return h.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function snapshotReadiness(
  mappings: readonly SnapshotMapping[],
  unresolvedItems: readonly SnapshotUnresolvedItem[],
): SnapshotReadiness {
  return mappings.every((mapping) => mapping.status === "mapped") && unresolvedItems.length === 0
    ? "final"
    : "review_required";
}

export function createReportSnapshot(
  input: Readonly<{
    id: string;
    version: number;
    organizationId: string;
    reportKind: AccountantReportKind;
    period: { startsOn?: string; endsOn?: string; asOfDate: string };
    dimensions?: Readonly<Record<string, string>>;
    accountingBasis: string;
    framework?: string;
    formulaVersions: Readonly<Record<string, string>>;
    mappingVersions?: Readonly<Record<string, string>>;
    ledgerCutoff: SnapshotLedgerCutoff;
    sourceManifest?: readonly CanonicalJsonObject[];
    mappings: readonly SnapshotMapping[];
    unresolvedItems: readonly SnapshotUnresolvedItem[];
    request: CanonicalJsonValue;
    result: CanonicalJsonValue;
    previousSnapshotId?: string;
    previousSnapshotVersion?: number;
    createdAt: string;
    createdBy: string;
  }>,
): ReportSnapshot {
  if (!ACCOUNTANT_REPORT_KINDS.includes(input.reportKind))
    throw new Error("Unsupported accountant report kind");
  if (!Number.isSafeInteger(input.version) || input.version < 1)
    throw new Error("Snapshot version is invalid");
  if (
    input.previousSnapshotVersion !== undefined &&
    (!Number.isSafeInteger(input.previousSnapshotVersion) ||
      input.previousSnapshotVersion < 1 ||
      input.previousSnapshotVersion >= input.version)
  )
    throw new Error("Previous snapshot version is invalid");
  if ((input.previousSnapshotId === undefined) !== (input.previousSnapshotVersion === undefined))
    throw new Error("Previous snapshot ID and version must be supplied together");
  const asOfDate = isoDate(input.period.asOfDate, "Snapshot as-of date");
  if (input.period.startsOn) isoDate(input.period.startsOn, "Snapshot start date");
  if (input.period.endsOn) isoDate(input.period.endsOn, "Snapshot end date");
  if (input.period.startsOn && input.period.endsOn && input.period.startsOn > input.period.endsOn)
    throw new Error("Snapshot period is invalid");
  isoDate(input.ledgerCutoff.throughDate, "Snapshot cutoff date");
  timestamp(input.ledgerCutoff.maxPostedAt, "Snapshot cutoff posted time");
  if (
    !Number.isSafeInteger(input.ledgerCutoff.journalCount) ||
    input.ledgerCutoff.journalCount < 0 ||
    !Number.isSafeInteger(input.ledgerCutoff.lineCount) ||
    input.ledgerCutoff.lineCount < 0
  )
    throw new Error("Snapshot cutoff counts are invalid");
  if (!/^[0-9a-f]{64}$/.test(input.ledgerCutoff.sourceFingerprint))
    throw new Error("Snapshot source fingerprint must be SHA-256");
  const mappings = Object.freeze(
    input.mappings.map((mapping) =>
      Object.freeze({ ...mapping, sourceKey: required(mapping.sourceKey, "Mapping source key") }),
    ),
  );
  const unresolvedItems = Object.freeze(
    input.unresolvedItems.map((item) =>
      Object.freeze({
        ...item,
        code: required(item.code, "Unresolved item code"),
        message: required(item.message, "Unresolved item message"),
        sourceIds: sortedUnique(item.sourceIds),
      }),
    ),
  );
  const canonicalRequestJson = canonicalJson(input.request),
    canonicalResultJson = canonicalJson(input.result);
  const requestHash = sha256Hex(canonicalRequestJson),
    resultHash = sha256Hex(canonicalResultJson);
  const snapshotHash = sha256Hex(
    canonicalJson({
      organizationId: input.organizationId.trim(),
      version: input.version,
      previousSnapshotId: input.previousSnapshotId,
      previousSnapshotVersion: input.previousSnapshotVersion,
      reportKind: input.reportKind,
      period: input.period,
      dimensions: input.dimensions ?? {},
      accountingBasis: input.accountingBasis.trim(),
      framework: input.framework,
      formulaVersions: input.formulaVersions,
      mappingVersions: input.mappingVersions ?? {},
      ledgerCutoff: input.ledgerCutoff,
      sourceManifest: input.sourceManifest ?? [],
      mappings,
      unresolvedItems,
      requestHash,
      resultHash,
    }),
  );
  return Object.freeze({
    schemaVersion: REPORT_SNAPSHOT_SCHEMA_VERSION,
    id: required(input.id, "Snapshot ID"),
    version: input.version,
    organizationId: required(input.organizationId, "Snapshot organization ID"),
    reportKind: input.reportKind,
    period: Object.freeze({
      ...(input.period.startsOn ? { startsOn: input.period.startsOn } : {}),
      ...(input.period.endsOn ? { endsOn: input.period.endsOn } : {}),
      asOfDate,
    }),
    dimensions: Object.freeze(
      Object.fromEntries(
        Object.entries(input.dimensions ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
    accountingBasis: required(input.accountingBasis, "Snapshot accounting basis"),
    ...(input.framework ? { framework: required(input.framework, "Snapshot framework") } : {}),
    formulaVersions: Object.freeze(
      Object.fromEntries(
        Object.entries(input.formulaVersions)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [
            required(key, "Formula key"),
            required(value, "Formula version"),
          ]),
      ),
    ),
    mappingVersions: Object.freeze(
      Object.fromEntries(
        Object.entries(input.mappingVersions ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [
            required(key, "Mapping key"),
            required(value, "Mapping version"),
          ]),
      ),
    ),
    ledgerCutoff: Object.freeze({ ...input.ledgerCutoff }),
    sourceManifest: Object.freeze(
      (input.sourceManifest ?? []).map((source) => Object.freeze({ ...source })),
    ),
    mappings,
    unresolvedItems,
    state: "captured",
    readiness: snapshotReadiness(mappings, unresolvedItems),
    canonicalRequestJson,
    canonicalResultJson,
    requestHash,
    resultHash,
    snapshotHash,
    ...(input.previousSnapshotId
      ? { previousSnapshotId: required(input.previousSnapshotId, "Previous snapshot ID") }
      : {}),
    ...(input.previousSnapshotVersion !== undefined
      ? { previousSnapshotVersion: input.previousSnapshotVersion }
      : {}),
    createdAt: timestamp(input.createdAt, "Snapshot created time"),
    createdBy: required(input.createdBy, "Snapshot creator"),
  });
}

export function assertSnapshotFinal(snapshot: ReportSnapshot): void {
  if (snapshot.readiness !== "final")
    throw new Error("Report snapshot is not ready for final export");
}

export function verifySnapshotReproduction(
  snapshot: ReportSnapshot,
  request: CanonicalJsonValue,
  result: CanonicalJsonValue,
) {
  const requestHash = sha256Hex(canonicalJson(request));
  const resultHash = sha256Hex(canonicalJson(result));
  return Object.freeze({
    requestHash,
    resultHash,
    requestMatches: requestHash === snapshot.requestHash,
    resultMatches: resultHash === snapshot.resultHash,
    reproducible: requestHash === snapshot.requestHash && resultHash === snapshot.resultHash,
  });
}
