import type { Pool, PoolClient } from "pg";
import type {
  OwnerRepaymentDirectionContract,
  OwnerSettlementOptionContract,
  OwnerYearEndPositionOptionPreviewContract,
  OwnerYearEndSettlementRecordContract,
} from "@naai-erp/contracts";
import type { OwnerPositionSnapshot } from "./period-close-accounts.helper.js";

export type SettlementRow = {
  id: string;
  fiscal_year: number;
  effective_on: string;
  settlement_option: OwnerSettlementOptionContract;
  repayment_direction: OwnerRepaymentDirectionContract | null;
  amount_minor: string;
  currency: string;
  debit_account_code: string;
  credit_account_code: string;
  financial_account_id: string | null;
  bank_transaction_id: string | null;
  journal_id: string;
  before_payable_3388_minor: string;
  before_receivable_1388_minor: string;
  before_custody_111_minor: string;
  after_payable_3388_minor: string;
  after_receivable_1388_minor: string;
  after_custody_111_minor: string;
  reference: string | null;
  description: string;
  reason: string;
  created_by: string;
  created_at: Date;
};

export function mapSettlementRow(row: SettlementRow): OwnerYearEndSettlementRecordContract {
  return {
    id: row.id,
    fiscalYear: row.fiscal_year,
    effectiveOn: row.effective_on,
    option: row.settlement_option,
    repaymentDirection: row.repayment_direction,
    amountMinor: row.amount_minor,
    currency: row.currency,
    debitAccountCode: row.debit_account_code,
    creditAccountCode: row.credit_account_code,
    financialAccountId: row.financial_account_id,
    bankTransactionId: row.bank_transaction_id,
    journalId: row.journal_id,
    beforePayable3388Minor: row.before_payable_3388_minor,
    beforeReceivable1388Minor: row.before_receivable_1388_minor,
    beforeCustody111Minor: row.before_custody_111_minor,
    afterPayable3388Minor: row.after_payable_3388_minor,
    afterReceivable1388Minor: row.after_receivable_1388_minor,
    afterCustody111Minor: row.after_custody_111_minor,
    reference: row.reference,
    description: row.description,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listYearEndSettlementRows(
  db: Pool | PoolClient,
  organizationId: string,
  fiscalYear: number,
): Promise<OwnerYearEndSettlementRecordContract[]> {
  const res = await db.query<SettlementRow>(
    `select id, fiscal_year, effective_on::text as effective_on, settlement_option,
            repayment_direction, amount_minor::text as amount_minor, currency,
            debit_account_code, credit_account_code, financial_account_id, bank_transaction_id,
            journal_id,
            before_payable_3388_minor::text as before_payable_3388_minor,
            before_receivable_1388_minor::text as before_receivable_1388_minor,
            before_custody_111_minor::text as before_custody_111_minor,
            after_payable_3388_minor::text as after_payable_3388_minor,
            after_receivable_1388_minor::text as after_receivable_1388_minor,
            after_custody_111_minor::text as after_custody_111_minor,
            reference, description, reason, created_by, created_at
       from owner_year_end_settlements
      where organization_id = $1 and fiscal_year = $2
      order by effective_on desc, created_at desc, id desc`,
    [organizationId, fiscalYear],
  );
  return res.rows.map(mapSettlementRow);
}

export function buildOwnerSettlementOptions(
  pos: OwnerPositionSnapshot,
): readonly OwnerYearEndPositionOptionPreviewContract[] {
  const maxOffset =
    pos.payable3388Minor < pos.receivable1388Minor ? pos.payable3388Minor : pos.receivable1388Minor;
  const maxRepayment =
    pos.payable3388Minor > pos.receivable1388Minor ? pos.payable3388Minor : pos.receivable1388Minor;

  return [
    {
      option: "repayment",
      label: "Hoàn tiền qua tài khoản công ty (3388 hoặc 1388)",
      available: maxRepayment > 0n,
      maxEligibleMinor: maxRepayment.toString(),
      debitAccountPreview:
        pos.payable3388Minor >= pos.receivable1388Minor
          ? pos.payable3388AccountCode
          : "112 / 111-CASH",
      creditAccountPreview:
        pos.payable3388Minor >= pos.receivable1388Minor
          ? "112 / 111-CASH"
          : pos.receivable1388AccountCode,
      description:
        "Công ty hoàn trả nợ chủ (Nợ 3388 / Có 112-111) hoặc chủ hoàn tiền phải thu về công ty (Nợ 112-111 / Có 1388).",
    },
    {
      option: "offset_3388_1388",
      label: "Cấn trừ phải trả chủ (3388) với phải thu chủ (1388)",
      available: maxOffset > 0n,
      maxEligibleMinor: maxOffset.toString(),
      debitAccountPreview: pos.payable3388AccountCode,
      creditAccountPreview: pos.receivable1388AccountCode,
      description:
        "Bù trừ hai chiều giữa số công ty nợ chủ (3388) và số chủ nợ công ty (1388) bằng bút toán có kiểm toán.",
    },
    {
      option: "profit_distribution",
      label: "Chủ quyết định chia lợi nhuận giải quyết phải thu (Nợ 421 / Có 1388)",
      available: pos.receivable1388Minor > 0n,
      maxEligibleMinor: pos.receivable1388Minor.toString(),
      debitAccountPreview: pos.retainedEarnings421AccountCode,
      creditAccountPreview: pos.receivable1388AccountCode,
      description:
        "Chủ doanh nghiệp một thành viên quyết định phân phối lợi nhuận sau thuế để tất toán khoản phải thu chủ (Nợ 421 / Có 1388).",
    },
  ];
}
