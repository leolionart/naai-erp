import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CreateCommercialDocumentInput } from "./commercial-document.types.js";

/**
 * Resolve the effective control account code for a purchase invoice from its
 * canonical funding specification (`BR-FUND-007`):
 * - `owner_paid` -> configured Balance Sheet `owner_current` account (`3388*`)
 * - `owner_custody_cash` / `company_cash` / `company_bank` -> selected
 *   financial account's `ledger_account_code` (`111-OWNER-CUSTODY`, `111-CASH`, `112*`)
 * - otherwise -> explicit `input.controlAccountCode`.
 */
export async function resolvePurchaseControlAccountCode(
  client: PoolClient,
  organizationId: string,
  input: CreateCommercialDocumentInput,
  resolveOwnerCurrent: (
    client: PoolClient,
    organizationId: string,
    documentDate: string,
  ) => Promise<string>,
): Promise<string> {
  if (input.type !== "purchase_invoice") return input.controlAccountCode;
  if (input.funding?.type === "owner_paid") {
    return resolveOwnerCurrent(client, organizationId, input.documentDate);
  }
  const financialAccountId =
    input.fundingSource?.financialAccountId?.trim() || input.funding?.financialAccountId?.trim();
  if (
    financialAccountId &&
    (input.funding?.type === "owner_custody_cash" ||
      input.funding?.type === "company_cash" ||
      input.funding?.type === "company_bank" ||
      input.fundingSource?.type === "financial_account")
  ) {
    const found = await client.query<{ ledger_account_code: string }>(
      `select ledger_account_code
         from financial_accounts
        where organization_id=$1 and id=$2 and currency=$3 and status='active'`,
      [organizationId, financialAccountId, input.currency],
    );
    if (!found.rows[0]) throw new Error("PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE");
    return found.rows[0].ledger_account_code;
  }
  return input.controlAccountCode;
}

export async function buildPurchaseFundingReplacement(
  pool: Pool,
  organizationId: string,
  existing: Record<string, unknown>,
  targetControlAccountCode: string,
  financialAccountId?: string,
): Promise<CreateCommercialDocumentInput> {
  let effectiveControl = targetControlAccountCode;
  let fundingSource: CreateCommercialDocumentInput["fundingSource"] | undefined;
  let funding: CreateCommercialDocumentInput["funding"] | undefined;
  if (financialAccountId) {
    const account = await pool.query<{
      id: string;
      code: string;
      kind: string;
      currency: string;
      ledger_account_code: string;
    }>(
      `select id,code,kind::text,currency,ledger_account_code from financial_accounts
        where organization_id=$1 and id=$2 and status='active'`,
      [organizationId, financialAccountId],
    );
    const acct = account.rows[0];
    if (!acct || acct.currency !== existing.currency) {
      throw new Error("PURCHASE_FUNDING_SOURCE_INVALID");
    }
    effectiveControl = effectiveControl || acct.ledger_account_code;
    fundingSource = { type: "financial_account", financialAccountId };
    funding = {
      type:
        acct.code === "CASH-OWNER-CUSTODY" || acct.ledger_account_code === "111-OWNER-CUSTODY"
          ? "owner_custody_cash"
          : acct.kind === "cash"
            ? "company_cash"
            : "company_bank",
      financialAccountId,
    };
  }
  const existingLines = Array.isArray(existing.lines)
    ? (existing.lines as Record<string, unknown>[])
    : [];
  return {
    id: randomUUID(),
    type: "purchase_invoice",
    documentNumber: String(existing.document_number),
    ...(existing.series ? { series: String(existing.series) } : {}),
    fiscalYear: Number(existing.fiscal_year),
    partyId: String(existing.party_id),
    documentDate: String(existing.document_date).slice(0, 10),
    dueDate: String(existing.due_date).slice(0, 10),
    currency: String(existing.currency),
    netMinor: String(existing.net_minor),
    taxMinor: String(existing.tax_minor),
    grossMinor: String(existing.gross_minor),
    controlAccountCode: effectiveControl,
    ...(fundingSource ? { fundingSource } : {}),
    ...(funding ? { funding } : {}),
    lines: existingLines.map((line) => ({
      description: String(line.description ?? ""),
      quantity: String(line.quantity ?? "1"),
      unitPriceMinor: String(line.unitPriceMinor ?? line.grossMinor ?? "0"),
      netMinor: String(line.netMinor ?? line.grossMinor ?? "0"),
      taxMinor: String(line.taxMinor ?? "0"),
      grossMinor: String(line.grossMinor ?? "0"),
      primaryAccountCode: String(line.primaryAccountCode ?? ""),
      ...(line.categoryCode ? { categoryCode: String(line.categoryCode) } : {}),
      ...(line.taxAccountCode ? { taxAccountCode: String(line.taxAccountCode) } : {}),
      ...(line.taxCode ? { taxCode: String(line.taxCode) } : {}),
      dimensions: (line.dimensions as Record<string, string> | undefined) ?? {},
      allocations: (Array.isArray(line.allocations)
        ? (line.allocations as Record<string, unknown>[])
        : []
      ).map((a) => ({
        id: String(a.id ?? a.allocation_id ?? randomUUID()),
        amountMinor: String(a.amountMinor ?? a.amount_minor),
        dimensions: (a.dimensions as Record<string, string> | undefined) ?? {},
      })),
    })),
  };
}
