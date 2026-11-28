import type { Pool } from "pg";
import { readOwnerCurrentLedgerBalances } from "./owner-custody-banking.js";
import { OWNER_CURRENT_MOVEMENTS_SQL } from "./owner-current-sources.sql.js";

export type OwnerCurrentMovementType =
  | "company_repayment_to_owner"
  | "owner_repayment"
  | "owner_custody_cash"
  | "owner_personal_withdrawal"
  | "owner_funding"
  | "owner_paid_company_cost"
  | "adjustment";

export type OwnerCurrentClassificationBasis =
  | "canonical_owner_paid_expense"
  | "canonical_owner_custody_receipt"
  | "company_funds_withdrawn_by_owner"
  | "owner_funding_to_company_funds"
  | "company_funds_repayment_to_owner"
  | "unresolved_owner_current_movement";

export type OwnerCurrentSource = Readonly<{
  sourceType?: unknown;
  fundingTreatments?: unknown;
  fundingFinancialAccountCode?: unknown;
}>;

export type OwnerSettlementInput = {
  statutoryOwnerCurrentBalance: bigint;
  ownerPaidCompanyCost: bigint;
  ownerCustodyCash: bigint;
  ownerPersonalWithdrawal: bigint;
  ownerFunding: bigint;
  ownerRepayment?: bigint;
  review: bigint;
  reviewCount: number;
  /** Balance of the dedicated 111-OWNER-CUSTODY ledger account when the organization uses it (BR-FUND-007). */
  ledgerCustodyCash?: bigint | null;
};

export function summarizeOwnerSettlement(input: OwnerSettlementInput) {
  const repayment = input.ownerRepayment ?? 0n;
  const ledgerCustody = input.ledgerCustodyCash ?? null;
  const positiveLedgerCustody = ledgerCustody !== null && ledgerCustody > 0n ? ledgerCustody : 0n;
  // Single-bucket net settlement: company cash held by the owner is consumed first against
  // confirmed owner outlays/funding before leaving net company debt to the owner.
  const confirmed =
    input.ownerPaidCompanyCost +
    input.ownerFunding -
    (ledgerCustody === null ? input.ownerCustodyCash : positiveLedgerCustody) -
    input.ownerPersonalWithdrawal -
    repayment;
  const custodyFunds = confirmed < 0n ? -confirmed : 0n;
  return {
    statutoryOwnerCurrentBalanceMinor: input.statutoryOwnerCurrentBalance.toString(),
    confirmedSettlementBalanceMinor: confirmed.toString(),
    companyOwesOwnerMinor: (confirmed > 0n ? confirmed : 0n).toString(),
    ownerHoldsCompanyFundsMinor: custodyFunds.toString(),
    ownerPaidCompanyCostMinor: input.ownerPaidCompanyCost.toString(),
    ownerCustodyCashMinor: (ledgerCustody ?? input.ownerCustodyCash).toString(),
    ownerPersonalWithdrawalMinor: input.ownerPersonalWithdrawal.toString(),
    ownerFundingMinor: input.ownerFunding.toString(),
    ...(repayment !== 0n ? { ownerRepaymentMinor: repayment.toString() } : {}),
    reviewMinor: input.review.toString(),
    reviewCount: input.reviewCount,
  };
}

export function classifyOwnerCurrentMovement(input: {
  ownerDelta: bigint;
  companyFundsDelta: bigint;
  sources: readonly OwnerCurrentSource[];
  reversalOfId?: string | null;
  custodyTransfer?: boolean;
  personalWithdrawal?: boolean;
  ownerRepayment?: boolean;
}): {
  movementType: OwnerCurrentMovementType;
  classificationBasis: OwnerCurrentClassificationBasis;
  needsReview: boolean;
} {
  const direction = input.reversalOfId ? -1n : 1n;
  const ownerDelta = input.ownerDelta * direction;
  const companyFundsDelta = input.companyFundsDelta * direction;
  if (ownerDelta < 0n && companyFundsDelta < 0n && input.custodyTransfer) {
    return {
      movementType: "owner_custody_cash",
      classificationBasis: "canonical_owner_custody_receipt",
      needsReview: false,
    };
  }
  if (ownerDelta < 0n && companyFundsDelta < 0n && input.personalWithdrawal) {
    return {
      movementType: "owner_personal_withdrawal",
      classificationBasis: "company_funds_withdrawn_by_owner",
      needsReview: false,
    };
  }
  if (ownerDelta < 0n && companyFundsDelta < 0n && input.ownerRepayment) {
    return {
      movementType: "owner_repayment",
      classificationBasis: "company_funds_repayment_to_owner",
      needsReview: false,
    };
  }
  if (ownerDelta > 0n && companyFundsDelta > 0n) {
    return {
      movementType: "owner_funding",
      classificationBasis: "owner_funding_to_company_funds",
      needsReview: false,
    };
  }
  const hasCanonicalOwnerPaidEvidence = input.sources.some((source) => {
    return (
      (source.sourceType === "expense" || source.sourceType === "purchase_invoice") &&
      Array.isArray(source.fundingTreatments) &&
      source.fundingTreatments.includes("owner_paid_company_cost") &&
      source.fundingFinancialAccountCode !== "CASH-OWNER-CUSTODY"
    );
  });
  if (ownerDelta > 0n && hasCanonicalOwnerPaidEvidence) {
    return {
      movementType: "owner_paid_company_cost",
      classificationBasis: "canonical_owner_paid_expense",
      needsReview: false,
    };
  }
  return {
    movementType: "adjustment",
    classificationBasis: "unresolved_owner_current_movement",
    needsReview: true,
  };
}

export async function queryOwnerCurrentMovements(pool: Pool, organizationId: string) {
  const result = await pool.query<{
    journal_id: string;
    journal_date: string;
    description: string;
    currency: string;
    state: string;
    reversal_of_id: string | null;
    owner_delta_minor: string;
    company_funds_delta_minor: string;
    owner_account_codes: string[];
    counterpart_lines: unknown[];
    sources: unknown[];
    custody_transfer_amounts: string[];
    custody_transfer_ids: string[];
    personal_withdrawal_minor: string | null;
    personal_withdrawal_id: string | null;
    owner_funding_movement_type: string | null;
    owner_funding_amount_minor: string | null;
    owner_funding_tx_id: string | null;
    owner_funding_reference: string | null;
  }>(OWNER_CURRENT_MOVEMENTS_SQL, [organizationId]);
  let ledgerClosing = 0n;
  let confirmedRunning = 0n;
  let ownerPaidCompanyCosts = 0n;
  let companyPaymentsToOwner = 0n;
  let ownerCashCustody = 0n;
  let ownerFunding = 0n;
  let ownerRepayments = 0n;
  let reviewAdjustments = 0n;
  const confirmedTimeline: Array<Record<string, unknown>> = [];
  const reviewItems: Array<Record<string, unknown>> = [];
  for (const row of result.rows) {
    const ownerDelta = BigInt(row.owner_delta_minor);
    const companyFundsDelta = BigInt(row.company_funds_delta_minor);
    const baseSources = Array.isArray(row.sources) ? (row.sources as OwnerCurrentSource[]) : [];
    const ownerMagnitude = ownerDelta < 0n ? -ownerDelta : ownerDelta;
    const custodyTransfer = (row.custody_transfer_amounts ?? []).some(
      (amount) => BigInt(amount) === ownerMagnitude,
    );
    const personalWithdrawal =
      row.personal_withdrawal_minor !== null &&
      BigInt(row.personal_withdrawal_minor) === ownerMagnitude;
    const ownerRepayment =
      row.owner_funding_movement_type === "owner_repayment" &&
      row.owner_funding_amount_minor !== null &&
      BigInt(row.owner_funding_amount_minor) === ownerMagnitude;
    const canonicalFunding =
      row.owner_funding_movement_type === "owner_funding" &&
      row.owner_funding_amount_minor !== null &&
      BigInt(row.owner_funding_amount_minor) === ownerMagnitude;
    const evidenceSources: Array<Record<string, unknown>> = [...baseSources];
    if (custodyTransfer && row.custody_transfer_ids[0])
      evidenceSources.push({
        sourceType: "internal_transfer",
        sourceId: row.custody_transfer_ids[0],
        title: "Company cash held in owner custody",
        detail: null,
        sourceHref: `/banking/internal-transfers/${row.custody_transfer_ids[0]}`,
        expenseClass: null,
        category: null,
        fundingTreatments: [],
        citState: null,
        vatState: null,
        grossMinor: ownerMagnitude.toString(),
        payeeName: null,
      });
    if (personalWithdrawal && row.personal_withdrawal_id)
      evidenceSources.push({
        sourceType: "bank_transaction",
        sourceId: row.personal_withdrawal_id,
        title: "Owner personal withdrawal",
        detail: null,
        sourceHref: `/banking/transactions/${row.personal_withdrawal_id}`,
        expenseClass: null,
        category: null,
        fundingTreatments: [],
        citState: null,
        vatState: null,
        grossMinor: ownerMagnitude.toString(),
        payeeName: null,
      });
    const outputSources: Array<Record<string, unknown>> = [...baseSources];
    if ((canonicalFunding || ownerRepayment) && row.owner_funding_tx_id) {
      const txSource = {
        sourceType: "bank_transaction",
        sourceId: row.owner_funding_tx_id,
        title: canonicalFunding ? "Owner funding deposit" : "Owner repayment",
        detail: row.owner_funding_reference ?? null,
        sourceHref: `/banking/transactions/${row.owner_funding_tx_id}`,
        expenseClass: null,
        category: null,
        fundingTreatments: [],
        citState: null,
        vatState: null,
        grossMinor: ownerMagnitude.toString(),
        payeeName: null,
      };
      evidenceSources.push(txSource);
      outputSources.push(txSource);
    }
    ledgerClosing += ownerDelta;
    const classification = classifyOwnerCurrentMovement({
      ownerDelta,
      companyFundsDelta,
      sources: evidenceSources,
      reversalOfId: row.reversal_of_id,
      custodyTransfer,
      personalWithdrawal,
      ownerRepayment,
    });
    if (classification.movementType === "owner_paid_company_cost")
      ownerPaidCompanyCosts += ownerDelta;
    if (classification.movementType === "owner_personal_withdrawal")
      companyPaymentsToOwner += -ownerDelta;
    if (classification.movementType === "owner_custody_cash") ownerCashCustody += -ownerDelta;
    if (classification.movementType === "owner_funding") ownerFunding += ownerDelta;
    if (classification.movementType === "owner_repayment") ownerRepayments += -ownerDelta;
    const evidence = {
      journalId: row.journal_id,
      date: row.journal_date,
      description: row.description,
      currency: row.currency,
      state: row.state,
      reversalOfId: row.reversal_of_id,
      ownerDeltaMinor: ownerDelta.toString(),
      companyFundsDeltaMinor: companyFundsDelta.toString(),
      ownerAccountCodes: row.owner_account_codes ?? [],
      counterpartLines: row.counterpart_lines ?? [],
      sources: outputSources,
    };
    if (classification.needsReview) {
      reviewAdjustments += ownerDelta;
      const repaymentShape = ownerDelta < 0n && companyFundsDelta < 0n;
      reviewItems.push({
        ...evidence,
        proposedMovementType: repaymentShape ? "company_repayment_to_owner" : null,
        reviewReason: repaymentShape
          ? "unsupported_company_repayment"
          : baseSources.length > 0
            ? "missing_source_of_funds_evidence"
            : "unresolved_owner_current_movement",
        needsReview: true,
      });
      continue;
    }
    confirmedRunning += ownerDelta;
    confirmedTimeline.push({
      ...evidence,
      movementType: classification.movementType,
      classificationBasis: classification.classificationBasis,
      needsReview: false,
      settlementDeltaMinor: ownerDelta.toString(),
      runningConfirmedSettlementBalanceMinor: confirmedRunning.toString(),
    });
  }
  const summaryInput: OwnerSettlementInput = {
    statutoryOwnerCurrentBalance: ledgerClosing,
    ownerPaidCompanyCost: ownerPaidCompanyCosts,
    ownerCustodyCash: ownerCashCustody,
    ownerPersonalWithdrawal: companyPaymentsToOwner,
    ownerFunding,
    ownerRepayment: ownerRepayments,
    review: reviewAdjustments,
    reviewCount: reviewItems.length,
  };
  return {
    summaryInput,
    summary: summarizeOwnerSettlement(summaryInput),
    confirmedTimeline: confirmedTimeline.reverse(),
    reviewItems: reviewItems.reverse(),
  };
}

/** Owner current movements plus the dedicated-custody-ledger view of the settlement summary (BR-FUND-007). */
export async function readOwnerCurrentMovements(pool: Pool, organizationId: string) {
  const { summaryInput, ...movements } = await queryOwnerCurrentMovements(pool, organizationId);
  const ledgerInfo = await readOwnerCurrentLedgerBalances(
    pool,
    organizationId,
    summaryInput.statutoryOwnerCurrentBalance,
  );
  const ledgerCustodyCash = ledgerInfo.hasDedicatedCustodyLedger
    ? ledgerInfo.ownerCustodyMinor
    : null;
  return {
    ...movements,
    summary: {
      ...summarizeOwnerSettlement({ ...summaryInput, ledgerCustodyCash }),
      ...(ledgerCustodyCash === null
        ? {}
        : { ledgerCustodyCashMinor: ledgerCustodyCash.toString() }),
    },
    ledgerBalances: ledgerInfo.ledgerBalances,
  };
}
