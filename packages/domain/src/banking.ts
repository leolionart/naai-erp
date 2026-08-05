import { currencyCode, type CurrencyCode } from "./organization-setup.js";
import { organizationId, type OrganizationId } from "./organization.js";

export const BANK_ACCOUNT_KINDS = ["bank", "cash"] as const;
export type BankAccountKind = (typeof BANK_ACCOUNT_KINDS)[number];
export type BankAccountStatus = "active" | "inactive";

export type BankAccount = Readonly<{
  organizationId: OrganizationId;
  id: string;
  code: string;
  name: string;
  kind: BankAccountKind;
  currency: CurrencyCode;
  ledgerAccountId: string;
  bankCode?: string;
  accountIdentifier?: string;
  provider?: string;
  status: BankAccountStatus;
}>;

export const BANK_TRANSACTION_STATES = [
  "imported",
  "suggested",
  "matched",
  "reconciled",
  "ignored",
  "needs_review",
] as const;
export type BankTransactionState = (typeof BANK_TRANSACTION_STATES)[number];

export type BankJsonPrimitive = string | number | boolean | null;
export interface BankJsonObject {
  readonly [key: string]: BankJsonValue;
}
export type BankJsonArray = readonly BankJsonValue[];
export type BankJsonValue = BankJsonPrimitive | BankJsonObject | BankJsonArray;

export type BankRawTransaction = Readonly<{
  schemaVersion: 1;
  payloadHash: string;
  payload: BankJsonObject;
}>;

export type BankTransactionNormalization = Readonly<{
  version: number;
  adapterId: string;
  adapterVersion: number;
  bookingDate: string;
  valueDate?: string;
  amountMinor: bigint;
  currency: CurrencyCode;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  providerTransactionId?: string;
}>;

export type BankTransaction = Readonly<{
  organizationId: OrganizationId;
  id: string;
  bankAccountId: string;
  sourceKey: string;
  raw: BankRawTransaction;
  normalizations: readonly BankTransactionNormalization[];
  state: BankTransactionState;
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function copyJson(value: unknown, path: string, seen: Set<object>): BankJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error(`${path} numbers must be finite safe integers`);
    }
    return value;
  }
  if (!value || typeof value !== "object") throw new Error(`${path} must contain JSON values`);
  if (seen.has(value)) throw new Error(`${path} must not contain circular references`);
  seen.add(value);
  let result: BankJsonValue;
  if (Array.isArray(value)) {
    result = Object.freeze(value.map((item, index) => copyJson(item, `${path}[${index}]`, seen)));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain plain JSON objects`);
    }
    result = Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (!key.trim()) throw new Error(`${path} keys must not be blank`);
          return [key, copyJson(item, `${path}.${key}`, seen)];
        }),
      ),
    );
  }
  seen.delete(value);
  return result;
}

export function createBankAccount(input: {
  organizationId: string;
  id: string;
  code: string;
  name: string;
  kind: BankAccountKind;
  currency: string;
  ledgerAccountId: string;
  bankCode?: string;
  accountIdentifier?: string;
  provider?: string;
}): BankAccount {
  if (!BANK_ACCOUNT_KINDS.includes(input.kind)) throw new Error("Bank account kind is invalid");
  const bankCode = optional(input.bankCode);
  const accountIdentifier = optional(input.accountIdentifier);
  const provider = optional(input.provider);
  if (input.kind === "bank" && (!bankCode || !accountIdentifier)) {
    throw new Error("Bank accounts require bank code and account identifier");
  }
  if (input.kind === "cash" && (bankCode || accountIdentifier || provider)) {
    throw new Error("Cash accounts cannot contain bank provider details");
  }
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Bank account ID"),
    code: required(input.code, "Bank account code"),
    name: required(input.name, "Bank account name"),
    kind: input.kind,
    currency: currencyCode(input.currency),
    ledgerAccountId: required(input.ledgerAccountId, "Ledger account ID"),
    ...(bankCode ? { bankCode } : {}),
    ...(accountIdentifier ? { accountIdentifier } : {}),
    ...(provider ? { provider } : {}),
    status: "active",
  });
}

export function deactivateBankAccount(account: BankAccount): BankAccount {
  if (account.status === "inactive") return account;
  return Object.freeze({ ...account, status: "inactive" });
}

export function buildBankTransactionFingerprintMaterial(input: {
  bookingDate: string;
  valueDate?: string;
  amountMinor: bigint;
  currency: string;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
}): string {
  const normalizeText = (value?: string) => value?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
  return JSON.stringify([
    isoDate(input.bookingDate, "Booking date"),
    input.valueDate ? isoDate(input.valueDate, "Value date") : "",
    input.amountMinor.toString(),
    currencyCode(input.currency),
    normalizeText(input.reference),
    normalizeText(input.counterpartyName),
    normalizeText(input.counterpartyAccount),
  ]);
}

export function bankTransactionSourceKey(input: {
  providerTransactionId?: string;
  fingerprintSha256?: string;
}): string {
  const providerTransactionId = optional(input.providerTransactionId);
  if (providerTransactionId) return `provider:${providerTransactionId}`;
  const fingerprint = input.fingerprintSha256?.trim().toLowerCase();
  if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error("A SHA-256 fingerprint is required when provider transaction ID is absent");
  }
  return `fingerprint:${fingerprint}`;
}

export function createBankTransactionNormalization(input: {
  version: number;
  adapterId: string;
  adapterVersion: number;
  bookingDate: string;
  valueDate?: string;
  amountMinor: bigint;
  currency: string;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  providerTransactionId?: string;
}): BankTransactionNormalization {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("Normalization version must be a positive integer");
  }
  if (!Number.isInteger(input.adapterVersion) || input.adapterVersion < 1) {
    throw new Error("Adapter version must be a positive integer");
  }
  if (input.amountMinor === 0n) throw new Error("Bank transaction amount cannot be zero");
  const valueDate = input.valueDate ? isoDate(input.valueDate, "Value date") : undefined;
  const reference = optional(input.reference);
  const counterpartyName = optional(input.counterpartyName);
  const counterpartyAccount = optional(input.counterpartyAccount);
  const providerTransactionId = optional(input.providerTransactionId);
  return Object.freeze({
    version: input.version,
    adapterId: required(input.adapterId, "Adapter ID"),
    adapterVersion: input.adapterVersion,
    bookingDate: isoDate(input.bookingDate, "Booking date"),
    ...(valueDate ? { valueDate } : {}),
    amountMinor: input.amountMinor,
    currency: currencyCode(input.currency),
    ...(reference ? { reference } : {}),
    ...(counterpartyName ? { counterpartyName } : {}),
    ...(counterpartyAccount ? { counterpartyAccount } : {}),
    ...(providerTransactionId ? { providerTransactionId } : {}),
  });
}

export function createBankTransaction(input: {
  organizationId: string;
  id: string;
  bankAccountId: string;
  providerTransactionId?: string;
  fingerprintSha256?: string;
  rawPayloadHash: string;
  rawPayload: Readonly<Record<string, unknown>>;
  normalization: BankTransactionNormalization;
}): BankTransaction {
  const rawPayloadHash = input.rawPayloadHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(rawPayloadHash)) throw new Error("Raw payload hash must be SHA-256");
  const rawPayload = copyJson(input.rawPayload, "Raw payload", new Set());
  if (Array.isArray(rawPayload) || rawPayload === null || typeof rawPayload !== "object") {
    throw new Error("Raw payload must be a JSON object");
  }
  if (input.normalization.version !== 1) {
    throw new Error("The first normalization version must be 1");
  }
  const providerTransactionId =
    input.providerTransactionId ?? input.normalization.providerTransactionId;
  if (
    input.providerTransactionId &&
    input.normalization.providerTransactionId &&
    input.providerTransactionId.trim() !== input.normalization.providerTransactionId.trim()
  ) {
    throw new Error("Provider transaction ID must match the normalized representation");
  }
  const sourceKey = providerTransactionId
    ? bankTransactionSourceKey({ providerTransactionId })
    : bankTransactionSourceKey(
        input.fingerprintSha256 ? { fingerprintSha256: input.fingerprintSha256 } : {},
      );
  const rawPayloadObject = rawPayload as BankJsonObject;
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Bank transaction ID"),
    bankAccountId: required(input.bankAccountId, "Bank account ID"),
    sourceKey,
    raw: Object.freeze({
      schemaVersion: 1,
      payloadHash: rawPayloadHash,
      payload: rawPayloadObject,
    }),
    normalizations: Object.freeze([input.normalization]),
    state: "imported",
  });
}

export function appendBankTransactionNormalization(
  transaction: BankTransaction,
  normalization: BankTransactionNormalization,
): BankTransaction {
  const expectedVersion = transaction.normalizations.length + 1;
  if (normalization.version !== expectedVersion) {
    throw new Error(`Normalization version must be ${expectedVersion}`);
  }
  return Object.freeze({
    ...transaction,
    normalizations: Object.freeze([...transaction.normalizations, normalization]),
  });
}

export function transitionBankTransaction(
  transaction: BankTransaction,
  next: BankTransactionState,
): BankTransaction {
  const allowed: Record<BankTransactionState, readonly BankTransactionState[]> = {
    imported: ["suggested", "needs_review", "ignored"],
    suggested: ["matched", "needs_review", "ignored"],
    matched: ["reconciled", "needs_review"],
    reconciled: [],
    ignored: [],
    needs_review: ["suggested", "ignored"],
  };
  if (!allowed[transaction.state].includes(next)) {
    throw new Error(`Invalid bank transaction transition: ${transaction.state} -> ${next}`);
  }
  return Object.freeze({ ...transaction, state: next });
}
