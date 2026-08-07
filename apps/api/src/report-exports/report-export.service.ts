import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import type { FilteredDocumentExportQueryContract } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  REPORT_EXPORT_STORE,
  type ExportInput,
  type ReportExportContext,
  type ReportExportStore,
  type SnapshotInput,
} from "./report-export.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE = new Set(["owner", "finance_admin", "accountant", "approver"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const KINDS = new Set([
  "profit_and_loss",
  "balance_sheet",
  "direct_cash_flow",
  "vat_reconciliation",
  "tax_expense_review",
]);

@Injectable()
export class ReportExportService {
  constructor(
    @Inject(REPORT_EXPORT_STORE) private readonly store: ReportExportStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlation: string) {
    return this.master.authenticate(auth, org, correlation);
  }
  private envelope(c: ReportExportContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  parseSnapshot(input: Record<string, unknown>): SnapshotInput {
    const period = (input.period ?? {}) as Record<string, unknown>;
    const formulas = input.formulaVersions as Record<string, unknown> | undefined;
    if (
      !KINDS.has(String(input.reportKind)) ||
      !DATE.test(String(period.asOfDate)) ||
      (period.startsOn != null && !DATE.test(String(period.startsOn))) ||
      (period.endsOn != null && !DATE.test(String(period.endsOn))) ||
      (period.startsOn != null &&
        period.endsOn != null &&
        String(period.startsOn) > String(period.endsOn)) ||
      !String(input.accountingBasis ?? "").trim() ||
      !formulas ||
      !Object.keys(formulas).length ||
      !input.request ||
      Array.isArray(input.request) ||
      typeof input.request !== "object"
    )
      throw new Error("VALIDATION_FAILED");
    return input as SnapshotInput;
  }
  parseExport(input: Record<string, unknown>): ExportInput {
    if (
      !String(input.snapshotId ?? "").trim() ||
      !Number.isInteger(input.snapshotVersion) ||
      Number(input.snapshotVersion) < 1 ||
      !["csv", "xlsx"].includes(String(input.format)) ||
      !KINDS.has(String(input.reportKind))
    )
      throw new Error("VALIDATION_FAILED");
    return input as ExportInput;
  }
  parseListExport(input: Record<string, unknown>): FilteredDocumentExportQueryContract {
    const startsOn = String(input.startsOn ?? "");
    const endsOn = String(input.endsOn ?? "");
    const invoicePresence = String(input.invoicePresence ?? "all");
    if (
      !DATE.test(startsOn) ||
      !DATE.test(endsOn) ||
      startsOn > endsOn ||
      !["all", "present", "missing"].includes(invoicePresence)
    )
      throw new Error("VALIDATION_FAILED");
    return {
      startsOn,
      endsOn,
      format: "xlsx",
      ...(input.state ? { state: String(input.state) } : {}),
      ...(input.partyId ? { partyId: String(input.partyId) } : {}),
      ...(input.payeePartyId ? { payeePartyId: String(input.payeePartyId) } : {}),
      ...(input.projectId ? { projectId: String(input.projectId) } : {}),
      invoicePresence: invoicePresence as "all" | "present" | "missing",
    };
  }
  listSnapshots(c: ReportExportContext) {
    return this.store.listSnapshots(c).then((x) => this.envelope(c, x));
  }
  getSnapshot(c: ReportExportContext, id: string, version?: number) {
    return this.store.getSnapshot(c, id, version).then((x) => this.envelope(c, x));
  }
  async createSnapshot(c: ReportExportContext, input: SnapshotInput, key?: string) {
    if (!c.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.envelope(c, await this.store.createSnapshot(c, input, key));
  }
  reproduceSnapshot(c: ReportExportContext, id: string, version: number) {
    if (!Number.isInteger(version) || version < 1) throw new Error("VALIDATION_FAILED");
    return this.store.reproduceSnapshot(c, id, version).then((x) => this.envelope(c, x));
  }
  listExports(c: ReportExportContext) {
    return this.store.listExports(c).then((x) => this.envelope(c, x));
  }
  getExport(c: ReportExportContext, id: string, version?: number) {
    return this.store.getExport(c, id, version).then((x) => this.envelope(c, x));
  }
  async createExport(c: ReportExportContext, input: ExportInput, key?: string) {
    if (!c.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.envelope(c, await this.store.createExport(c, input, key));
  }
  download(c: ReportExportContext, id: string, version: number) {
    if (!Number.isInteger(version) || version < 1) throw new Error("VALIDATION_FAILED");
    return this.store.downloadExport(c, id, version);
  }
  exportSalesInvoices(c: ReportExportContext, filters: FilteredDocumentExportQueryContract) {
    if (!c.roles.some((r) => EXPORT_ROLES.has(r))) throw new Error("FORBIDDEN");
    return this.store.exportSalesInvoices(c, filters);
  }
  exportPurchaseInvoicesExpenses(
    c: ReportExportContext,
    filters: FilteredDocumentExportQueryContract,
  ) {
    if (!c.roles.some((r) => EXPORT_ROLES.has(r))) throw new Error("FORBIDDEN");
    return this.store.exportPurchaseInvoicesExpenses(c, filters);
  }
  async supersede(
    c: ReportExportContext,
    id: string,
    version: number,
    reason: string,
    key?: string,
  ) {
    if (!c.roles.some((r) => APPROVE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!Number.isInteger(version) || version < 1 || !reason.trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.supersedeExport(c, id, version, reason, key));
  }
}
