import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgExpenseStore } from "./pg-expense.store.js";
import type {
  CreateExpenseInput,
  ExpenseContext,
  ExpenseReviewInput,
  ExternalReferenceInput,
} from "./expense.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const REVIEW = new Set(["owner", "finance_admin", "accountant", "approver"]);
const TAX_REVIEW = new Set(["owner", "finance_admin", "accountant"]);
const POST = new Set(["owner", "finance_admin", "accountant"]);

interface ExistingExpense {
  expense_class: string;
  payee_party_id: string | null;
  employee_party_id: string | null;
  expense_date: Date | string;
  service_period_start: Date | string | null;
  service_period_end: Date | string | null;
  business_purpose: string;
  currency: string;
  net_minor: string | number;
  vat_minor: string | number;
  gross_minor: string | number;
  counter_account_code: string;
  evidence_checklist: Record<string, boolean> | null;
  externalReference?: {
    system: string;
    externalId: string;
    canonicalUrl?: string;
    checksum?: string;
    version?: string;
    metadata?: Record<string, unknown>;
  } | null;
  lines: Array<{
    lineNumber: number;
    description: string;
    netMinor: string | number;
    vatMinor: string | number;
    grossMinor: string | number;
    postingAccountCode: string;
    vatAccountCode?: string;
    managementState?: "unreviewed" | "valid" | "invalid" | "accountant_override";
    citState?:
      "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
    vatState?:
      "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
    citEligibleMinor?: string | number;
    vatEligibleMinor?: string | number;
    dimensions?: Record<string, string>;
    allocations: Array<{
      id?: string;
      amount_minor: string | number;
      dimensions?: Record<string, string>;
    }>;
  }>;
}

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
  async update(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: Partial<CreateExpenseInput>,
    key?: string,
  ) {
    if (!context.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");

    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
    if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

    const merged = this.mergeExpense(existing, input);
    this.validate(merged);

    return this.envelope(
      context,
      await this.store.update(context, id, expectedVersion, merged, key),
    );
  }

  private mergeExpense(
    existing: ExistingExpense,
    input: Partial<CreateExpenseInput>,
  ): CreateExpenseInput {
    const formatDate = (d: Date | string | null | undefined) =>
      d instanceof Date
        ? d.toISOString().slice(0, 10)
        : typeof d === "string"
          ? d.slice(0, 10)
          : String(d);

    const existingLines = (existing.lines || []).map((l) => {
      const allocations = (l.allocations || []).map((a) => {
        const { allocationId, ...restDims } = a.dimensions || {};
        return {
          id: allocationId || a.id || randomUUID(),
          amountMinor: String(a.amount_minor),
          dimensions: restDims as Record<string, string>,
        };
      });
      const line: CreateExpenseInput["lines"][number] = {
        description: l.description,
        netMinor: String(l.netMinor),
        vatMinor: String(l.vatMinor),
        grossMinor: String(l.grossMinor),
        postingAccountCode: l.postingAccountCode,
        dimensions: l.dimensions || {},
        allocations,
        ...(l.vatAccountCode ? { vatAccountCode: l.vatAccountCode } : {}),
        ...(l.managementState ? { managementState: l.managementState } : {}),
        ...(l.citState ? { citState: l.citState } : {}),
        ...(l.vatState ? { vatState: l.vatState } : {}),
        ...(l.citEligibleMinor ? { citEligibleMinor: String(l.citEligibleMinor) } : {}),
        ...(l.vatEligibleMinor ? { vatEligibleMinor: String(l.vatEligibleMinor) } : {}),
      };
      return line;
    });

    const mergedExtRef =
      input.externalReference !== undefined
        ? input.externalReference || undefined
        : existing.externalReference
          ? {
              system: existing.externalReference.system,
              externalId: existing.externalReference.externalId,
              canonicalUrl: existing.externalReference.canonicalUrl || undefined,
              checksum: existing.externalReference.checksum || undefined,
              version: existing.externalReference.version || undefined,
              metadata: existing.externalReference.metadata,
            }
          : undefined;

    const payee = input.payeePartyId !== undefined ? input.payeePartyId : existing.payee_party_id;
    const employee =
      input.employeePartyId !== undefined ? input.employeePartyId : existing.employee_party_id;
    const start =
      input.servicePeriodStart !== undefined
        ? input.servicePeriodStart
        : existing.service_period_start;
    const end =
      input.servicePeriodEnd !== undefined ? input.servicePeriodEnd : existing.service_period_end;
    const checklist =
      input.evidenceChecklist !== undefined ? input.evidenceChecklist : existing.evidence_checklist;

    let cleanedExtRef: ExternalReferenceInput | undefined = undefined;
    if (mergedExtRef) {
      cleanedExtRef = {
        system: mergedExtRef.system,
        externalId: mergedExtRef.externalId,
        ...(mergedExtRef.canonicalUrl ? { canonicalUrl: mergedExtRef.canonicalUrl } : {}),
        ...(mergedExtRef.checksum ? { checksum: mergedExtRef.checksum } : {}),
        ...(mergedExtRef.version ? { version: mergedExtRef.version } : {}),
        ...(mergedExtRef.metadata ? { metadata: mergedExtRef.metadata } : {}),
      };
    }

    const result: CreateExpenseInput = {
      expenseClass: input.expenseClass !== undefined ? input.expenseClass : existing.expense_class,
      expenseDate:
        input.expenseDate !== undefined ? input.expenseDate : formatDate(existing.expense_date),
      businessPurpose:
        input.businessPurpose !== undefined ? input.businessPurpose : existing.business_purpose,
      currency: input.currency !== undefined ? input.currency : existing.currency,
      netMinor: input.netMinor !== undefined ? input.netMinor : String(existing.net_minor),
      vatMinor: input.vatMinor !== undefined ? input.vatMinor : String(existing.vat_minor),
      grossMinor: input.grossMinor !== undefined ? input.grossMinor : String(existing.gross_minor),
      counterAccountCode:
        input.counterAccountCode !== undefined
          ? input.counterAccountCode
          : existing.counter_account_code,
      lines: input.lines !== undefined ? input.lines : existingLines,
      ...(payee ? { payeePartyId: payee } : {}),
      ...(employee ? { employeePartyId: employee } : {}),
      ...(start ? { servicePeriodStart: formatDate(start) } : {}),
      ...(end ? { servicePeriodEnd: formatDate(end) } : {}),
      ...(checklist ? { evidenceChecklist: checklist as Record<string, boolean> } : {}),
      ...(cleanedExtRef ? { externalReference: cleanedExtRef } : {}),
    };

    return result;
  }
  async create(context: ExpenseContext, input: CreateExpenseInput, key?: string) {
    if (!context.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    this.validate(input);
    return this.envelope(context, await this.store.create(context, input, key));
  }
  validatePortableInput(input: CreateExpenseInput) {
    this.validate(input);
  }
  async reverseReplace(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: CreateExpenseInput,
    reason: string,
    key?: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    this.validate(input);
    return this.envelope(
      context,
      await this.store.reverseReplace(context, id, expectedVersion, input, reason.trim(), key),
    );
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

    if (input.externalReference) {
      if (!input.externalReference.system?.trim() || !input.externalReference.externalId?.trim()) {
        throw new Error("VALIDATION_FAILED");
      }
    }
  }
}
