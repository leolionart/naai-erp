import { type Context, READ_ROLES } from "./funding-plans.service.shared.js";
import type { FundingPlansService } from "./funding-plans.service.js";

/**
 * Lists posted expenses and purchase invoices with no `funding_financial_account_id`,
 * proposing a target funding from bank reconciliation, funding rules, or category treatment.
 */
export async function listUnlinkedOperation(this: FundingPlansService, context: Context) {
  if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
  const [expRes, docRes] = await Promise.all([
    this.pool.query<{
      id: string;
      dt: string;
      payee_party_id: string | null;
      description: string;
      gross_minor: string;
      counter_account_code: string;
      category_code: string | null;
      ext_system: string | null;
      rec_fa_id: string | null;
      rec_fa_kind: string | null;
      cat_treatment: string | null;
    }>(
      `select e.id, e.expense_date::text as dt, e.payee_party_id, e.business_purpose as description,
              e.gross_minor::text, e.counter_account_code,
              (select l.expense_category_code from expense_lines l
                where l.organization_id=e.organization_id and l.expense_id=e.id
                order by l.line_number asc limit 1) as category_code,
              er.system as ext_system,
              bt.financial_account_id as rec_fa_id, fa.kind::text as rec_fa_kind,
              ec.funding_treatment::text as cat_treatment
         from expenses e
         left join external_references er on er.organization_id=e.organization_id and er.expense_id=e.id
         left join reconciliation_allocations ra on ra.organization_id=e.organization_id and ra.expense_id=e.id
         left join payment_reconciliations pr on pr.organization_id=ra.organization_id and pr.id=ra.reconciliation_id
         left join bank_transactions bt on bt.organization_id=pr.organization_id and bt.id=pr.bank_transaction_id
         left join financial_accounts fa on fa.organization_id=bt.organization_id and fa.id=bt.financial_account_id
         left join expense_categories ec on ec.organization_id=e.organization_id and ec.code=(
           select l.expense_category_code from expense_lines l
            where l.organization_id=e.organization_id and l.expense_id=e.id
            order by l.line_number asc limit 1
         )
        where e.organization_id=$1 and e.state='posted' and e.funding_financial_account_id is null
        order by e.expense_date desc, e.id asc`,
      [context.organizationId],
    ),
    this.pool.query<{
      id: string;
      dt: string;
      party_id: string;
      description: string;
      gross_minor: string;
      control_account_code: string;
      category_code: string | null;
      ext_system: string | null;
      rec_fa_id: string | null;
      rec_fa_kind: string | null;
    }>(
      `select d.id, d.document_date::text as dt, d.party_id, d.document_number as description,
              d.gross_minor::text, d.control_account_code,
              (select l.category_code from commercial_document_lines l
                where l.organization_id=d.organization_id and l.document_id=d.id
                order by l.line_number asc limit 1) as category_code,
              er.system as ext_system,
              bt.financial_account_id as rec_fa_id, fa.kind::text as rec_fa_kind
         from commercial_documents d
         left join external_references er on er.organization_id=d.organization_id and er.document_id=d.id
         left join reconciliation_allocations ra on ra.organization_id=d.organization_id and ra.commercial_document_id=d.id
         left join payment_reconciliations pr on pr.organization_id=ra.organization_id and pr.id=ra.reconciliation_id
         left join bank_transactions bt on bt.organization_id=pr.organization_id and bt.id=pr.bank_transaction_id
         left join financial_accounts fa on fa.organization_id=bt.organization_id and fa.id=bt.financial_account_id
        where d.organization_id=$1 and d.type='purchase_invoice'
          and d.state in ('posted','issued') and d.funding_financial_account_id is null
        order by d.document_date desc, d.id asc`,
      [context.organizationId],
    ),
  ]);

  const items: Array<{
    kind: "expense" | "purchase_invoice";
    id: string;
    date: string;
    description: string;
    grossMinor: string;
    currentAccount: string;
    suggestedTargetFunding: string | null;
    suggestionSource: "bank_reconciliation" | "funding_rule" | "category_treatment" | "unresolved";
  }> = [];
  let totalGross = 0n;

  for (const r of expRes.rows) {
    totalGross += BigInt(r.gross_minor);
    let suggestedTargetFunding: string | null = null;
    let suggestionSource:
      "bank_reconciliation" | "funding_rule" | "category_treatment" | "unresolved" = "unresolved";
    if (r.rec_fa_id) {
      suggestedTargetFunding = `${r.rec_fa_kind === "cash" ? "company_cash" : "company_bank"}:${r.rec_fa_id}`;
      suggestionSource = "bank_reconciliation";
    } else if (this.fundingRules) {
      const res = await this.fundingRules.resolveForIngestion(context.organizationId, {
        ...(r.ext_system ? { externalSystem: r.ext_system } : {}),
        ...(r.payee_party_id ? { partyId: r.payee_party_id } : {}),
        ...(r.category_code ? { categoryCode: r.category_code } : {}),
        description: r.description,
        grossMinor: r.gross_minor,
      });
      if (res.source === "rule") {
        suggestedTargetFunding = res.resolvedFunding.financialAccountId
          ? `${res.resolvedFunding.type}:${res.resolvedFunding.financialAccountId}`
          : res.resolvedFunding.type;
        suggestionSource = "funding_rule";
      }
    }
    if (!suggestedTargetFunding && r.cat_treatment === "owner_paid_company_cost") {
      suggestedTargetFunding = "owner_paid";
      suggestionSource = "category_treatment";
    }
    items.push({
      kind: "expense",
      id: r.id,
      date: r.dt,
      description: r.description,
      grossMinor: r.gross_minor,
      currentAccount: r.counter_account_code,
      suggestedTargetFunding,
      suggestionSource,
    });
  }

  for (const r of docRes.rows) {
    totalGross += BigInt(r.gross_minor);
    let suggestedTargetFunding: string | null = null;
    let suggestionSource:
      "bank_reconciliation" | "funding_rule" | "category_treatment" | "unresolved" = "unresolved";
    if (r.rec_fa_id) {
      suggestedTargetFunding = `${r.rec_fa_kind === "cash" ? "company_cash" : "company_bank"}:${r.rec_fa_id}`;
      suggestionSource = "bank_reconciliation";
    } else if (this.fundingRules) {
      const res = await this.fundingRules.resolveForIngestion(context.organizationId, {
        ...(r.ext_system ? { externalSystem: r.ext_system } : {}),
        partyId: r.party_id,
        ...(r.category_code ? { categoryCode: r.category_code } : {}),
        description: r.description,
        grossMinor: r.gross_minor,
      });
      if (res.source === "rule") {
        suggestedTargetFunding = res.resolvedFunding.financialAccountId
          ? `${res.resolvedFunding.type}:${res.resolvedFunding.financialAccountId}`
          : res.resolvedFunding.type;
        suggestionSource = "funding_rule";
      }
    }
    items.push({
      kind: "purchase_invoice",
      id: r.id,
      date: r.dt,
      description: r.description,
      grossMinor: r.gross_minor,
      currentAccount: r.control_account_code,
      suggestedTargetFunding,
      suggestionSource,
    });
  }

  return this.envelope(context, {
    summary: {
      totalCount: items.length,
      totalGrossMinor: totalGross.toString(),
      suggestedCount: items.filter((i) => i.suggestedTargetFunding !== null).length,
    },
    items,
  });
}
