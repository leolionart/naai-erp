export interface CategoryValidationQueryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export type ResolvedExpenseCategory = Readonly<{
  source: "expense" | "business" | "legacy";
  fundingTreatment: string | null;
}>;

/**
 * BR-EDIT-001: Validate an expense category against canonical organization catalogs
 * (`expense_categories` and `business_categories(kind='expense')`) first, falling back
 * to legacy `dimension_values(kind='category')` only when the code does not exist in
 * either canonical catalog.
 */
export async function resolveExpenseCategory(
  client: CategoryValidationQueryable,
  organizationId: string,
  category: string,
): Promise<ResolvedExpenseCategory> {
  const canonical = await client.query<{
    source: "expense" | "business";
    is_active: boolean;
    funding_treatment: string | null;
  }>(
    `select 'expense'::text as source, is_active, funding_treatment::text as funding_treatment
       from expense_categories
      where organization_id = $1 and code = $2
     union all
     select 'business'::text as source, is_active, null::text as funding_treatment
       from business_categories
      where organization_id = $1 and kind = 'expense' and code = $2`,
    [organizationId, category],
  );
  if (canonical.rows.length > 0) {
    const activeExpense = canonical.rows.find((row) => row.source === "expense" && row.is_active);
    if (activeExpense) {
      return { source: "expense", fundingTreatment: activeExpense.funding_treatment };
    }
    const activeBusiness = canonical.rows.find((row) => row.source === "business" && row.is_active);
    if (activeBusiness) {
      return { source: "business", fundingTreatment: null };
    }
    throw new Error("CATEGORY_NOT_FOUND");
  }

  const legacy = await client.query<{ ok: number }>(
    `select 1 as ok from dimension_values
      where organization_id = $1 and kind = 'category' and code = $2 and is_active = true
      limit 1`,
    [organizationId, category],
  );
  if (!legacy.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
  return { source: "legacy", fundingTreatment: null };
}

export async function applyExpenseLineCategoryUpdate(
  client: CategoryValidationQueryable,
  organizationId: string,
  expenseId: string,
  category: string | null,
  resolved?: ResolvedExpenseCategory,
): Promise<void> {
  if (category === null) {
    await client.query(
      `update expense_lines
          set expense_category_code = null,
              funding_treatment = null,
              dimensions = coalesce(dimensions, '{}'::jsonb) - 'category'
        where organization_id = $1 and expense_id = $2`,
      [organizationId, expenseId],
    );
    return;
  }
  const target = resolved ?? (await resolveExpenseCategory(client, organizationId, category));
  if (target.source === "expense") {
    await client.query(
      `update expense_lines
          set expense_category_code = $3,
              funding_treatment = $4::expense_funding_treatment,
              dimensions = coalesce(dimensions, '{}'::jsonb) - 'category'
        where organization_id = $1 and expense_id = $2`,
      [organizationId, expenseId, category, target.fundingTreatment],
    );
    return;
  }
  await client.query(
    `update expense_lines
        set expense_category_code = null,
            funding_treatment = null,
            dimensions = coalesce(dimensions, '{}'::jsonb) || jsonb_build_object('category', $3::text)
      where organization_id = $1 and expense_id = $2`,
    [organizationId, expenseId, category],
  );
}

/**
 * BR-EDIT-001: Validate a commercial-document category against canonical organization
 * catalogs (`business_categories`, plus `expense_categories` for purchase invoices),
 * falling back to legacy `dimension_values(kind='category')` only when absent from
 * canonical catalogs.
 */
export async function assertDocumentCategory(
  client: CategoryValidationQueryable,
  organizationId: string,
  documentType: string,
  category: string,
): Promise<void> {
  const canonical =
    documentType === "purchase_invoice"
      ? await client.query<{ is_active: boolean }>(
          `select is_active from business_categories
            where organization_id = $1 and kind = 'expense' and code = $2
           union all
           select is_active from expense_categories
            where organization_id = $1 and code = $2`,
          [organizationId, category],
        )
      : await client.query<{ is_active: boolean }>(
          `select is_active from business_categories
            where organization_id = $1 and kind = 'revenue' and code = $2`,
          [organizationId, category],
        );
  if (canonical.rows.length > 0) {
    if (!canonical.rows.some((row) => row.is_active)) throw new Error("CATEGORY_NOT_FOUND");
    return;
  }

  const legacy = await client.query<{ ok: number }>(
    `select 1 as ok from dimension_values
      where organization_id = $1 and kind = 'category' and code = $2 and is_active = true
      limit 1`,
    [organizationId, category],
  );
  if (!legacy.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
}

export async function applyDocumentLineCategoryUpdate(
  client: CategoryValidationQueryable,
  organizationId: string,
  documentId: string,
  category: string | null,
): Promise<void> {
  await client.query(
    `update commercial_document_lines
        set category_code = $3,
            dimensions = coalesce(dimensions, '{}'::jsonb) - 'category'
      where organization_id = $1 and document_id = $2`,
    [organizationId, documentId, category],
  );
}
