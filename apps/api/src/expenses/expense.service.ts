import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgExpenseStore } from "./pg-expense.store.js";
import type { CreateExpenseInput, ExpenseContext, ExpenseReviewInput } from "./expense.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const REVIEW = new Set(["owner", "finance_admin", "accountant", "approver"]);
const TAX_REVIEW = new Set(["owner", "finance_admin", "accountant"]);
const POST = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class ExpenseService {
  constructor(
    @Inject(PgExpenseStore) private readonly store: PgExpenseStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: ExpenseContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async list(
    context: ExpenseContext,
    filters: { state?: string; expenseClass?: string; payeePartyId?: string },
  ) {
    return this.envelope(context, {
      items: await this.store.list(context.organizationId, filters),
    });
  }
  async get(context: ExpenseContext, id: string) {
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
  async create(context: ExpenseContext, input: CreateExpenseInput, key?: string) {
    if (!context.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    this.validate(input);
    return this.envelope(context, await this.store.create(context, input, key));
  }
  async transition(
    context: ExpenseContext,
    id: string,
    action: string,
    input: { reason?: string; missingEvidenceTypes?: string[] },
    key?: string,
  ) {
    const roles =
      action === "approve" ? REVIEW : ["post", "cancel"].includes(action) ? POST : WRITE;
    if (!context.roles.some((r) => roles.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.transition(
        context,
        id,
        action,
        input.reason.trim(),
        input.missingEvidenceTypes ?? [],
        key,
      ),
    );
  }
  async review(context: ExpenseContext, id: string, input: ExpenseReviewInput, key?: string) {
    const roles = input.axis === "management" ? REVIEW : TAX_REVIEW;
    if (!context.roles.some((r) => roles.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!Number.isInteger(input.lineNumber) || input.lineNumber < 1 || !input.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    if (input.state === "accountant_override" && !input.reference?.trim())
      throw new Error("ACCOUNTANT_OVERRIDE_REFERENCE_REQUIRED");
    return this.envelope(context, await this.store.review(context, id, input, key));
  }
  private validate(input: CreateExpenseInput) {
    if (
      !input.expenseClass?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) ||
      !input.businessPurpose?.trim() ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !input.counterAccountCode?.trim() ||
      input.lines.length === 0
    )
      throw new Error("VALIDATION_FAILED");
    if (input.expenseClass === "employee_reimbursement" && !input.employeePartyId)
      throw new Error("REIMBURSEMENT_EMPLOYEE_REQUIRED");
    let net = 0n,
      vat = 0n,
      gross = 0n;
    for (const line of input.lines) {
      const lineNet = BigInt(line.netMinor),
        lineVat = BigInt(line.vatMinor),
        lineGross = BigInt(line.grossMinor);
      if (
        !line.description?.trim() ||
        !line.postingAccountCode?.trim() ||
        lineNet <= 0n ||
        lineVat < 0n ||
        lineGross !== lineNet + lineVat ||
        (lineVat > 0n && !line.vatAccountCode) ||
        (lineVat === 0n && line.vatAccountCode)
      )
        throw new Error("VALIDATION_FAILED");
      let allocated = 0n;
      const ids = new Set<string>();
      for (const allocation of line.allocations) {
        if (
          !allocation.id?.trim() ||
          ids.has(allocation.id) ||
          Object.keys(allocation.dimensions).length === 0
        )
          throw new Error("EXPENSE_ALLOCATION_INVALID");
        ids.add(allocation.id);
        const amount = BigInt(allocation.amountMinor);
        if (amount <= 0n) throw new Error("EXPENSE_ALLOCATION_INVALID");
        allocated += amount;
      }
      if (allocated !== lineNet) throw new Error("EXPENSE_ALLOCATION_MISMATCH");
      if (
        input.expenseClass === "non_documented" &&
        (lineVat !== 0n || ![undefined, "ineligible", "unreviewed"].includes(line.vatState))
      )
        throw new Error("VAT_EVIDENCE_REQUIRED");
      net += lineNet;
      vat += lineVat;
      gross += lineGross;
    }
    if (
      net !== BigInt(input.netMinor) ||
      vat !== BigInt(input.vatMinor) ||
      gross !== BigInt(input.grossMinor) ||
      gross !== net + vat
    )
      throw new Error("EXPENSE_CONTROL_TOTAL_MISMATCH");
  }
}
