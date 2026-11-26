export const FOREIGN_CURRENCY_NOT_SUPPORTED = "FOREIGN_CURRENCY_NOT_SUPPORTED";

export interface BaseCurrencyProvider {
  getBaseCurrency?: (organizationId: string) => Promise<string>;
}

export interface PgQueryable {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export type ForeignCurrencyError = Error & {
  code: string;
  userMessage: string;
  details: Record<string, unknown>;
};

export function foreignCurrencyNotSupportedError(
  baseCurrency: string,
  receivedCurrency: string,
  extraDetails?: Record<string, unknown>,
): ForeignCurrencyError {
  const normalizedBase = baseCurrency.trim().toUpperCase() || "VND";
  const normalizedReceived = receivedCurrency.trim().toUpperCase();
  const guidance = `quy đổi sang ${normalizedBase} trước khi nhập, ghi tỷ giá vào mô tả`;
  const error = new Error(FOREIGN_CURRENCY_NOT_SUPPORTED) as ForeignCurrencyError;
  error.code = FOREIGN_CURRENCY_NOT_SUPPORTED;
  error.userMessage = `Chỉ hỗ trợ ghi sổ theo tiền tệ gốc ${normalizedBase} (đã nhận ${normalizedReceived}); vui lòng ${guidance}.`;
  error.details = {
    baseCurrency: normalizedBase,
    receivedCurrency: normalizedReceived,
    guidance,
    ...(extraDetails ?? {}),
  };
  return error;
}

export function isForeignCurrencyNotSupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === FOREIGN_CURRENCY_NOT_SUPPORTED ||
    ("code" in error && (error as { code?: unknown }).code === FOREIGN_CURRENCY_NOT_SUPPORTED)
  );
}

export function assertBaseCurrency(
  baseCurrency: string,
  receivedCurrency: unknown,
  extraDetails?: Record<string, unknown>,
): void {
  if (typeof receivedCurrency !== "string") return;
  const trimmed = receivedCurrency.trim();
  if (!/^[A-Za-z]{3}$/.test(trimmed)) return;
  const normalizedBase = (baseCurrency || "VND").trim().toUpperCase();
  if (trimmed.toUpperCase() !== normalizedBase) {
    throw foreignCurrencyNotSupportedError(normalizedBase, trimmed, extraDetails);
  }
}

export async function assertMasterBaseCurrency(
  masterData: BaseCurrencyProvider | undefined,
  organizationId: string,
  receivedCurrency: unknown,
  extraDetails?: Record<string, unknown>,
): Promise<void> {
  const baseCurrency = (await masterData?.getBaseCurrency?.(organizationId)) ?? "VND";
  assertBaseCurrency(baseCurrency, receivedCurrency, extraDetails);
}

export async function queryOrganizationBaseCurrency(
  queryable: PgQueryable,
  organizationId: string,
): Promise<string> {
  const result = await queryable.query<{ base_currency: string }>(
    "select base_currency from organizations where id=$1",
    [organizationId],
  );
  return result.rows[0]?.base_currency ?? "VND";
}

export async function assertWorkbookBaseCurrency(
  queryable: PgQueryable,
  organizationId: string,
  payload: {
    salesInvoices?: ReadonlyArray<{ id?: string; currency?: string; sourceRowIndex?: number }>;
    expenses?: ReadonlyArray<{ id?: string; currency?: string; sourceRowIndex?: number }>;
  },
): Promise<void> {
  const baseCurrency = await queryOrganizationBaseCurrency(queryable, organizationId);
  for (const invoice of payload.salesInvoices ?? []) {
    assertBaseCurrency(baseCurrency, invoice.currency, {
      source: "workbook_import",
      kind: "sales_invoice",
      id: invoice.id,
      sourceRowIndex: invoice.sourceRowIndex,
    });
  }
  for (const expense of payload.expenses ?? []) {
    assertBaseCurrency(baseCurrency, expense.currency, {
      source: "workbook_import",
      kind: "expense",
      id: expense.id,
      sourceRowIndex: expense.sourceRowIndex,
    });
  }
}
