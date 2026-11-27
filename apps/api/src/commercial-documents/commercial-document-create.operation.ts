import { resolveExternalReferenceOperation } from "./commercial-document-external-reference.operation.js";
import { createHash, randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import { applySolopreneurPurchaseDocumentDefaults } from "../payment-evidence/payment-evidence-evaluator.js";
import { finalizeDocumentCreateAuditAndOutbox } from "../draft-recording/auto-record-ingestion.helper.js";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import { assertDocumentCategory } from "../master-data/canonical-category-validation.js";
import { resolveOwnerFundingTraceability } from "../owner-funding/owner-funding-traceability.js";
import { purchaseLineTaxDecision } from "./commercial-document-tax.helper.js";
import { resolvePurchaseControlAccountCode } from "./document-funding.js";
import type {
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";
import { type StoredDocument } from "./pg-commercial-document.store.shared.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function createOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  input: CreateCommercialDocumentInput,
  idempotencyKey: string,
) {
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const replay = await this.lockReplay(
      client,
      context.organizationId,
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const effectiveControlAccountCode = await resolvePurchaseControlAccountCode(
      client,
      context.organizationId,
      input,
      (c, orgId, docDate) => this.ownerCurrentAccount(c, orgId, docDate),
    );
    if (input.externalReference) {
      const existing = await resolveExternalReferenceOperation.call(
        this,
        client,
        context,
        input,
        effectiveControlAccountCode,
      );
      if (existing) return existing;
    }

    // Duplicate checks:
    if (input.type === "purchase_invoice")
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `purchase-expense:${context.organizationId}:${input.partyId ?? ""}:${input.documentDate}:${input.grossMinor}:${input.currency}`,
      ]);
    const duplicateResult = await client.query<{ id: string }>(
      input.type === "purchase_invoice"
        ? `select id from commercial_documents
           where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5 and state<>'cancelled'`
        : `select id from commercial_documents
           where organization_id=$1 and type=$2 and party_id=$3 and document_number=$4 and document_date=$5 and gross_minor=$6 and currency=$7 and state<>'cancelled'`,
      input.type === "purchase_invoice"
        ? [
            context.organizationId,
            input.partyId,
            input.documentDate,
            input.grossMinor,
            input.currency,
          ]
        : [
            context.organizationId,
            input.type,
            input.partyId,
            input.documentNumber,
            input.documentDate,
            input.grossMinor,
            input.currency,
          ],
    );
    if (duplicateResult.rows.length > 0) {
      throw new Error("DUPLICATE_DOCUMENT");
    }

    if (input.type === "purchase_invoice") {
      const duplicateExpense = await client.query<{ id: string }>(
        `select id from expenses
         where organization_id=$1 and payee_party_id is not distinct from $2 and expense_date=$3 and gross_minor=$4 and currency=$5 and state<>'reversed'`,
        [
          context.organizationId,
          input.partyId,
          input.documentDate,
          input.grossMinor,
          input.currency,
        ],
      );
      if (input.migrationSourceExpenseId) {
        const migrationSource = await client.query<{ id: string }>(
          `select id from expenses
           where organization_id=$1 and id=$2 and payee_party_id=$3 and expense_date=$4
             and gross_minor=$5 and currency=$6`,
          [
            context.organizationId,
            input.migrationSourceExpenseId,
            input.partyId,
            input.migrationSourceExpenseDate,
            input.grossMinor,
            input.currency,
          ],
        );
        if (!migrationSource.rows[0]) throw new Error("MIGRATION_SOURCE_EXPENSE_MISMATCH");
      } else if (duplicateExpense.rows.length > 0) {
        throw new Error("DUPLICATE_DOCUMENT");
      }
    }

    // Owner-paid/custody purchases credit the configured owner-current ledger
    // account. Company-bank purchases continue to resolve their financial
    // account's ledger code below.
    const ownerFundingTrace =
      input.type === "purchase_invoice"
        ? await resolveOwnerFundingTraceability(client, context.organizationId, {
            ownerFundingId: input.ownerFundingId ?? input.funding?.ownerFundingId,
            ownerFundingTransactionId:
              input.ownerFundingTransactionId ?? input.funding?.ownerFundingTransactionId,
            fundingType: input.funding?.type,
            fundingFinancialAccountId:
              input.fundingSource?.financialAccountId ?? input.funding?.financialAccountId,
            currency: input.currency,
          })
        : undefined;
    const id = input.id ?? randomUUID();
    if (input.type === "credit_note")
      await this.assertCreditAllowed(client, context.organizationId, input);
    const paymentEvidence = mergePaymentEvidenceFields(input);
    await client.query(
      `insert into commercial_documents
       (organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,
        currency,net_minor,tax_minor,gross_minor,control_account_code,funding_financial_account_id,owner_funding_movement_id,payment_method,paid_on,payment_evidence_ref,transaction_evidence,original_document_id,reason,created_by)
       values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::date,$19,$20,$21,$22,$23)`,
      [
        context.organizationId,
        id,
        input.type,
        input.documentNumber,
        input.series ?? null,
        input.fiscalYear,
        input.partyId,
        input.documentDate,
        input.dueDate,
        input.currency,
        input.netMinor,
        input.taxMinor,
        input.grossMinor,
        effectiveControlAccountCode,
        input.fundingSource?.financialAccountId ?? ownerFundingTrace?.financialAccountId ?? null,
        ownerFundingTrace?.movementId ?? null,
        paymentEvidence.paymentMethod,
        paymentEvidence.paidOn,
        paymentEvidence.paymentEvidenceRef,
        paymentEvidence.transactionEvidence,
        input.originalDocumentId ?? null,
        input.reason ?? null,
        context.actorId,
      ],
    );
    const operatingMode = await this.operatingMode(client, context.organizationId);
    for (const [lineIndex, line] of input.lines.entries()) {
      await this.insertDocumentLine(client, context, id, lineIndex + 1, input, line, operatingMode);
      for (const [allocationIndex, allocation] of line.allocations.entries())
        await client.query(
          `insert into commercial_document_allocations
           (organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            context.organizationId,
            id,
            lineIndex + 1,
            allocationIndex + 1,
            allocation.amountMinor,
            { ...allocation.dimensions, allocationId: allocation.id },
          ],
        );
    }
    if (input.externalReference) {
      await client.query(
        `insert into external_references
         (organization_id, system, external_id, document_id, canonical_url, checksum, version, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          context.organizationId,
          input.externalReference.system,
          input.externalReference.externalId,
          id,
          input.externalReference.canonicalUrl ?? null,
          input.externalReference.checksum ?? null,
          input.externalReference.version ?? null,
          input.externalReference.metadata ?? {},
        ],
      );
    }

    const autoComplete = operatingMode === "solopreneur" && context.roles.includes("owner");
    let finalState = "draft";
    let resourceVersion = "1";
    let journalId: string | null = null;
    if (autoComplete) {
      const document: StoredDocument = {
        id,
        type: input.type,
        state: "draft",
        document_date: input.documentDate,
        currency: input.currency,
        party_id: input.partyId,
        document_number: input.documentNumber,
        net_minor: input.netMinor,
        tax_minor: input.taxMinor,
        gross_minor: input.grossMinor,
        control_account_code: effectiveControlAccountCode,
        funding_financial_account_id: input.fundingSource?.financialAccountId ?? null,
        original_document_id: input.originalDocumentId ?? null,
        created_by: context.actorId,
        version: "1",
      };
      if (input.type === "sales_invoice")
        await this.assertSalesContractCoverage(client, context.organizationId, document);
      await this.assertPostingPeriod(client, context, input.documentDate);
      if (input.type === "purchase_invoice" && document.funding_financial_account_id) {
        const funding = await client.query<{ ledger_account_code: string }>(
          `select ledger_account_code from financial_accounts where organization_id=$1 and id=$2
           and currency=$3 and status='active' for update`,
          [context.organizationId, document.funding_financial_account_id, document.currency],
        );
        if (!funding.rows[0]) throw new Error("PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE");
        document.control_account_code = funding.rows[0].ledger_account_code;
      }
      if (input.type === "purchase_invoice") {
        await applySolopreneurPurchaseDocumentDefaults(
          client,
          context,
          id,
          "Solopreneur save and record",
        );
      }
      journalId = await this.postDocumentJournal(client, context, document);
      finalState =
        input.type === "purchase_invoice" && document.funding_financial_account_id
          ? "paid"
          : input.type === "purchase_invoice"
            ? "posted"
            : "issued";
      resourceVersion = input.type === "purchase_invoice" ? "5" : "3";
      await client.query(
        `update commercial_documents set state=$3,version=$4,updated_at=now(),control_account_code=$7,
           approved_by=case when type='purchase_invoice' then $5 else approved_by end,
           approved_at=case when type='purchase_invoice' then now() else approved_at end,
           issued_or_posted_by=$5,issued_or_posted_at=now(),journal_id=$6
         where organization_id=$1 and id=$2`,
        [
          context.organizationId,
          id,
          finalState,
          resourceVersion,
          context.actorId,
          journalId,
          document.control_account_code,
        ],
      );
      await client.query(
        `insert into commercial_document_events
         (organization_id,id,document_id,from_state,to_state,actor_id,reason,correlation_id)
         values($1,$2,$3,'draft',$4,$5,'Solopreneur save and record',$6)`,
        [
          context.organizationId,
          randomUUID(),
          id,
          finalState,
          context.actorId,
          context.correlationId,
        ],
      );
    }
    const response = await finalizeDocumentCreateAuditAndOutbox(client, context, {
      id,
      type: input.type,
      operatingMode,
      autoComplete,
      finalState,
      resourceVersion,
      journalId,
      ...(input.migrationSourceExpenseId
        ? {
            migrationSourceExpenseId: input.migrationSourceExpenseId,
            migrationSourceExpenseDate: input.migrationSourceExpenseDate,
          }
        : {}),
      nextActionsForState: (state) => this.nextActions(input.type, state),
    });
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:create",
      requestHash,
      response,
    );
    await client.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function insertDocumentLineOperation(
  this: PgCommercialDocumentStore,
  client: PoolClient,
  context: CommercialDocumentContext,
  documentId: string,
  lineNumber: number,
  input: CreateCommercialDocumentInput,
  line: CreateCommercialDocumentInput["lines"][number],
  operatingMode: string | null,
) {
  const defaultTax = purchaseLineTaxDecision(input, line, operatingMode);
  const account = await client.query<{ root_type: string }>(
    "select root_type::text from accounts where organization_id=$1 and code=$2",
    [context.organizationId, line.primaryAccountCode],
  );
  const tax =
    input.type === "purchase_invoice" && account.rows[0]?.root_type === "asset"
      ? { ...defaultTax, citState: "ineligible", citEligibleMinor: "0" }
      : defaultTax;
  const categoryCode = line.categoryCode?.trim() || line.dimensions?.category?.trim() || null;
  if (categoryCode) {
    await assertDocumentCategory(client, context.organizationId, input.type, categoryCode);
  }
  const dimensions = Object.fromEntries(
    Object.entries(line.dimensions ?? {}).filter(([key]) => key !== "category"),
  );
  await client.query(
    `insert into commercial_document_lines
     (organization_id,document_id,line_number,original_line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,
      primary_account_code,category_code,tax_account_code,tax_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,
      reviewed_by,reviewed_at,review_reason,review_reference,dimensions)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      context.organizationId,
      documentId,
      lineNumber,
      line.originalLineNumber ?? null,
      line.description,
      line.quantity,
      line.unitPriceMinor,
      line.netMinor,
      line.taxMinor,
      line.grossMinor,
      line.primaryAccountCode,
      categoryCode,
      line.taxAccountCode ?? null,
      line.taxCode ?? null,
      tax.managementState,
      tax.citState,
      tax.vatState,
      tax.citEligibleMinor,
      tax.vatEligibleMinor,
      tax.reviewed ? context.actorId : null,
      tax.reviewed ? new Date() : null,
      tax.reviewed ? "Resolved when the purchase invoice was recorded" : null,
      tax.reviewed
        ? operatingMode === "solopreneur"
          ? "solopreneur_policy"
          : "explicit_tax_state"
        : null,
      dimensions,
    ],
  );
}
