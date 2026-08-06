import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  FINANCIAL_STATEMENT_STORE,
  type DrilldownQuery,
  type FinancialStatementContext,
  type FinancialStatementStore,
  type MappingInput,
  type StatementKind,
  type StatementQuery,
} from "./financial-statement.types.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE = new Set(["owner", "finance_admin", "accountant", "approver"]);
const kinds = new Set(["profit_and_loss", "balance_sheet", "cash_flow", "vat_reconciliation"]);

@Injectable()
export class FinancialStatementService {
  constructor(
    @Inject(FINANCIAL_STATEMENT_STORE) private readonly store: FinancialStatementStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlation: string) {
    return this.master.authenticate(auth, org, correlation);
  }
  private envelope(c: FinancialStatementContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  parseQuery(input: Record<string, string | undefined>, balanceSheet = false): StatementQuery {
    const todayStr = new Date().toISOString().substring(0, 10);
    const endsOn = (input.endsOn ?? input.to ?? todayStr).substring(0, 10);
    const defaultStart = `${endsOn.substring(0, 4)}-01-01`;
    const startsOn = (input.startsOn ?? input.from ?? defaultStart).substring(0, 10);
    const rawAsOf = input.asOfInstant ?? input.asOf;
    const asOfInstant =
      rawAsOf && rawAsOf.includes("T") && !Number.isNaN(Date.parse(rawAsOf))
        ? rawAsOf
        : `${endsOn}T16:59:59.999Z`;
    const framework = ["TT133", "TT200"].includes(input.framework ?? "")
      ? input.framework!
      : "TT133";
    const basis = ["accrual", "cash"].includes(input.basis ?? "") ? input.basis! : "accrual";

    if (!DATE.test(endsOn) || (!balanceSheet && !DATE.test(startsOn)) || startsOn > endsOn) {
      throw new Error("VALIDATION_FAILED");
    }
    const dimensions = Object.fromEntries(
      Object.entries({
        cost_center: input.costCenter ?? input.costCenterId ?? input.costCenterCode,
        service_line: input.serviceLine ?? input.serviceLineCode,
        project: input.projectId,
        client: input.clientId,
        team: input.teamId,
        owner: input.ownerId,
      }).filter((x): x is [string, string] => Boolean(x[1])),
    );
    return {
      ...(startsOn ? { startsOn } : {}),
      endsOn,
      asOfInstant,
      framework: framework as StatementQuery["framework"],
      basis: basis as StatementQuery["basis"],
      dimensions,
    };
  }
  parseMapping(input: Record<string, unknown>): MappingInput {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    if (
      !["TT133", "TT200"].includes(String(input.framework)) ||
      !DATE.test(String(input.effectiveFrom)) ||
      (input.effectiveTo != null && !DATE.test(String(input.effectiveTo))) ||
      !String(input.changeReason ?? "").trim() ||
      !lines.length
    )
      throw new Error("VALIDATION_FAILED");
    for (const raw of lines) {
      const line = raw as Record<string, unknown>;
      if (
        !kinds.has(String(line.statement)) ||
        !String(line.lineCode ?? "").trim() ||
        !String(line.label ?? "").trim() ||
        !String(line.accountCode ?? "").trim() ||
        !Number.isInteger(line.displayOrder) ||
        ![-1, 1].includes(Number(line.sign ?? 1))
      )
        throw new Error("VALIDATION_FAILED");
    }
    if (input.reportPolicy) {
      const policy = input.reportPolicy as Record<string, unknown>;
      try {
        if (
          BigInt(String(policy.maxLedgerDifferenceMinor)) < 0n ||
          BigInt(String(policy.maxUnreviewedInputMinor)) < 0n ||
          !Number.isInteger(policy.maxUnresolvedItemCount) ||
          Number(policy.maxUnresolvedItemCount) < 0 ||
          !Number.isInteger(policy.maxMissingEvidenceCount) ||
          Number(policy.maxMissingEvidenceCount) < 0
        )
          throw new Error();
      } catch {
        throw new Error("VALIDATION_FAILED");
      }
    }
    return input as MappingInput;
  }
  listMappings(c: FinancialStatementContext) {
    return this.store.listMappings(c).then((x) => this.envelope(c, x));
  }
  getMapping(c: FinancialStatementContext, id: string, version?: number) {
    return this.store.getMapping(c, id, version).then((x) => this.envelope(c, x));
  }
  async createMapping(c: FinancialStatementContext, input: MappingInput, key?: string) {
    if (!c.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.envelope(c, await this.store.createMapping(c, input, key));
  }
  async approveMapping(
    c: FinancialStatementContext,
    id: string,
    version: number,
    reason: string,
    key?: string,
  ) {
    if (!c.roles.some((r) => APPROVE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!Number.isInteger(version) || version < 1 || !reason.trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.approveMapping(c, id, version, reason, key));
  }
  report(c: FinancialStatementContext, kind: StatementKind, q: StatementQuery) {
    return this.store.report(c, kind, q).then((x) => this.envelope(c, x));
  }
  drilldown(c: FinancialStatementContext, q: DrilldownQuery) {
    return this.store.drilldown(c, q).then((x) => this.envelope(c, x));
  }
  resolveSource(c: FinancialStatementContext, journalId: string, lineNumber: number) {
    if (!journalId.trim() || !Number.isInteger(lineNumber) || lineNumber < 1)
      throw new Error("VALIDATION_FAILED");
    return this.store.resolveSource(c, journalId, lineNumber).then((x) => this.envelope(c, x));
  }
  expenseExceptions(c: FinancialStatementContext, q: StatementQuery, state?: string) {
    if (state && !["all", "unreviewed", "exception", "reviewed"].includes(state))
      throw new Error("VALIDATION_FAILED");
    return this.store.expenseExceptions(c, q, state).then((x) => this.envelope(c, x));
  }
}
