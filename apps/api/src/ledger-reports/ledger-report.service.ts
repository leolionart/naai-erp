import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgLedgerReportStore } from "./pg-ledger-report.store.js";
import type {
  LedgerReportContext,
  OpeningBalanceInput,
  ReportRange,
} from "./ledger-report.types.js";

const OPENING_ROLES = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class LedgerReportService {
  constructor(
    @Inject(PgLedgerReportStore) private readonly store: PgLedgerReportStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: LedgerReportContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  private validateRange(range: ReportRange) {
    for (const value of [range.from, range.to])
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("VALIDATION_FAILED");
    if (range.from && range.to && range.from > range.to) throw new Error("VALIDATION_FAILED");
  }
  async trialBalance(context: LedgerReportContext, range: ReportRange) {
    this.validateRange(range);
    return this.envelope(context, await this.store.trialBalance(context.organizationId, range));
  }
  async generalLedger(context: LedgerReportContext, range: ReportRange) {
    this.validateRange(range);
    return this.envelope(context, await this.store.generalLedger(context.organizationId, range));
  }
  async listOpeningBalances(context: LedgerReportContext) {
    return this.envelope(context, {
      items: await this.store.listOpeningBalances(context.organizationId),
    });
  }
  async getOpeningBalance(context: LedgerReportContext, importId: string) {
    const item = await this.store.getOpeningBalance(context.organizationId, importId);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
  async dryRunOpeningBalance(context: LedgerReportContext, input: OpeningBalanceInput) {
    if (!context.roles.some((role) => OPENING_ROLES.has(role))) throw new Error("FORBIDDEN");
    const validation = await this.validateOpeningBalance(context.organizationId, input);
    return this.envelope(context, { valid: true, ...validation, nextActions: ["create"] });
  }
  async createOpeningBalance(
    context: LedgerReportContext,
    input: OpeningBalanceInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => OPENING_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    await this.validateOpeningBalance(context.organizationId, input);
    return this.envelope(
      context,
      await this.store.createOpeningBalance(context, input, idempotencyKey),
    );
  }
  private async validateOpeningBalance(organizationId: string, input: OpeningBalanceInput) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.openingDate) ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !input.description?.trim() ||
      input.lines.length < 2
    )
      throw new Error("VALIDATION_FAILED");
    let debit = 0n;
    let credit = 0n;
    for (const line of input.lines) {
      let lineDebit: bigint;
      let lineCredit: bigint;
      try {
        lineDebit = BigInt(line.debitMinor ?? "0");
        lineCredit = BigInt(line.creditMinor ?? "0");
      } catch {
        throw new Error("VALIDATION_FAILED");
      }
      if (lineDebit > 0n === lineCredit > 0n) throw new Error("VALIDATION_FAILED");
      debit += lineDebit;
      credit += lineCredit;
    }
    if (
      debit !== credit ||
      debit !== BigInt(input.controlDebitMinor) ||
      credit !== BigInt(input.controlCreditMinor)
    )
      throw new Error("OPENING_BALANCE_CONTROL_TOTAL_MISMATCH");
    const requestedCodes = [...new Set(input.lines.map((line) => line.accountCode))];
    const controls = await this.store.inspectControlAccounts(organizationId, requestedCodes);
    if (controls.length !== requestedCodes.length || controls.some((row) => !row.is_active))
      throw new Error("OPENING_BALANCE_ACCOUNT_INVALID");
    const controlCodes = new Set(
      controls.filter((row) => row.is_control_account).map((row) => row.code),
    );
    const missingDetail = input.lines.some(
      (line) =>
        controlCodes.has(line.accountCode) &&
        (!line.dimensions?.partyId || !line.dimensions?.documentRef),
    );
    if (missingDetail) throw new Error("OPENING_BALANCE_SUBLEDGER_DETAIL_REQUIRED");
    return {
      controlDebitMinor: debit.toString(),
      controlCreditMinor: credit.toString(),
      differenceMinor: "0",
      lineCount: input.lines.length,
    };
  }
}
