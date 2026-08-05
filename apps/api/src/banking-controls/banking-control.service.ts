import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  BANKING_CONTROL_STORE,
  type BankingControlContext,
  type BankingControlStore,
  type CloseStatementSessionInput,
  type CreateControlExceptionInput,
  type CreateStatementSessionInput,
  type ReviewControlExceptionInput,
} from "./banking-control.types.js";
const MANAGE = new Set(["owner", "finance_admin", "accountant"]),
  APPROVE = new Set(["owner", "finance_admin"]);
@Injectable()
export class BankingControlService {
  constructor(
    @Inject(BANKING_CONTROL_STORE) private readonly store: BankingControlStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, c: string) {
    return this.master.authenticate(a, o, c);
  }
  private envelope(c: BankingControlContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private write(c: BankingControlContext, key?: string, roles = MANAGE): asserts key is string {
    if (!c.roles.some((r) => roles.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  async list(c: BankingControlContext) {
    return this.envelope(c, await this.store.list(c.organizationId));
  }
  async get(c: BankingControlContext, id: string) {
    const d = await this.store.get(c.organizationId, id);
    if (!d) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, d);
  }
  async create(c: BankingControlContext, i: CreateStatementSessionInput, key?: string) {
    this.write(c, key);
    if (
      i.schemaVersion !== 1 ||
      !i.financialAccountId?.trim() ||
      !/^[A-Z]{3}$/.test(i.currency) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(i.periodStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(i.periodEnd) ||
      i.periodEnd < i.periodStart ||
      !i.reason?.trim() ||
      !i.importIds.length ||
      !this.integer(i.openingBalanceMinor) ||
      !this.integer(i.closingBalanceMinor)
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.create(c, i, key));
  }
  async close(c: BankingControlContext, id: string, i: CloseStatementSessionInput, key?: string) {
    this.write(c, key);
    if (i.schemaVersion !== 1 || !/^\d+$/.test(i.expectedResourceVersion) || !i.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.close(c, id, i, key));
  }
  async reviewSession(
    c: BankingControlContext,
    id: string,
    i: CloseStatementSessionInput,
    key?: string,
  ) {
    this.write(c, key);
    if (i.schemaVersion !== 1 || !/^\d+$/.test(i.expectedResourceVersion) || !i.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.review(c, id, i, key));
  }
  async createException(
    c: BankingControlContext,
    s: string,
    i: CreateControlExceptionInput,
    key?: string,
  ) {
    this.write(c, key);
    if (
      i.schemaVersion !== 1 ||
      i.kind !== "suspense" ||
      !i.bankTransactionId?.trim() ||
      !this.integer(i.amountMinor) ||
      i.amountMinor === "0" ||
      !/^[A-Z]{3}$/.test(i.currency) ||
      !i.ownerId?.trim() ||
      !i.reason?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(i.reviewDue)
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.createException(c, s, i, key));
  }
  async reviewException(
    c: BankingControlContext,
    s: string,
    id: string,
    a: "approve" | "resolve" | "reject",
    i: ReviewControlExceptionInput,
    key?: string,
  ) {
    this.write(c, key, a === "approve" ? APPROVE : MANAGE);
    if (i.schemaVersion !== 1 || !/^\d+$/.test(i.expectedResourceVersion) || !i.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    if (a === "resolve" && !("resolutionReference" in i && i.resolutionReference?.trim()))
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.reviewException(c, s, id, a, i, key));
  }
  private integer(v: string) {
    return /^-?\d+$/.test(v);
  }
}
