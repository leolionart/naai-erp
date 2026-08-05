import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE_ROLES = new Set(["owner", "finance_admin", "accountant", "approver"]);
const POST_ROLES = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class CommercialDocumentService {
  constructor(
    @Inject(PgCommercialDocumentStore) private readonly store: PgCommercialDocumentStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: CommercialDocumentContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async list(context: CommercialDocumentContext, type?: string, state?: string, partyId?: string) {
    return this.envelope(context, {
      items: await this.store.list(context.organizationId, {
        ...(type ? { type } : {}),
        ...(state ? { state } : {}),
        ...(partyId ? { partyId } : {}),
      }),
    });
  }
  async get(context: CommercialDocumentContext, id: string) {
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
  async create(
    context: CommercialDocumentContext,
    input: CreateCommercialDocumentInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    this.validate(input);
    return this.envelope(context, await this.store.create(context, input, idempotencyKey));
  }
  async transition(
    context: CommercialDocumentContext,
    id: string,
    action: CommercialDocumentAction,
    input: { reason?: string },
    idempotencyKey?: string,
  ) {
    const roles =
      action === "approve"
        ? APPROVE_ROLES
        : ["issue", "post", "cancel"].includes(action)
          ? POST_ROLES
          : WRITE_ROLES;
    if (!context.roles.some((role) => roles.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.transition(context, id, action, input.reason.trim(), idempotencyKey),
    );
  }
  private validate(input: CreateCommercialDocumentInput) {
    if (
      !input.documentNumber?.trim() ||
      !input.partyId?.trim() ||
      !input.controlAccountCode?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
      input.dueDate < input.documentDate ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      input.lines.length === 0 ||
      !Number.isInteger(input.fiscalYear) ||
      input.fiscalYear < 1900 ||
      input.fiscalYear > 9999
    )
      throw new Error("VALIDATION_FAILED");
    if (
      (input.type === "credit_note") !== Boolean(input.originalDocumentId) ||
      (input.type === "credit_note" && !input.reason?.trim())
    )
      throw new Error("VALIDATION_FAILED");
    let net = 0n;
    let tax = 0n;
    let gross = 0n;
    for (const line of input.lines) {
      let lineNet: bigint;
      let lineTax: bigint;
      let lineGross: bigint;
      let quantity: number;
      try {
        lineNet = BigInt(line.netMinor);
        lineTax = BigInt(line.taxMinor);
        lineGross = BigInt(line.grossMinor);
        quantity = Number(line.quantity);
      } catch {
        throw new Error("VALIDATION_FAILED");
      }
      if (
        !line.description?.trim() ||
        !line.primaryAccountCode?.trim() ||
        quantity <= 0 ||
        !Number.isFinite(quantity) ||
        lineNet <= 0n ||
        lineTax < 0n ||
        lineGross !== lineNet + lineTax ||
        (lineTax > 0n && !line.taxAccountCode?.trim()) ||
        (lineTax === 0n && line.taxAccountCode)
      )
        throw new Error("VALIDATION_FAILED");
      if (
        input.type === "purchase_invoice" &&
        lineTax > 0n &&
        line.allocations.some(
          (allocation) =>
            !["eligible", "partially_eligible", "ineligible", "accountant_override"].includes(
              allocation.dimensions.taxState ?? "",
            ),
        )
      )
        throw new Error("PURCHASE_TAX_REVIEW_REQUIRED");
      const ids = new Set<string>();
      let allocated = 0n;
      for (const allocation of line.allocations) {
        if (
          !allocation.id?.trim() ||
          ids.has(allocation.id) ||
          Object.keys(allocation.dimensions).length === 0
        )
          throw new Error("DOCUMENT_ALLOCATION_INVALID");
        ids.add(allocation.id);
        const amount = BigInt(allocation.amountMinor);
        if (amount <= 0n) throw new Error("DOCUMENT_ALLOCATION_INVALID");
        allocated += amount;
      }
      if (allocated !== lineNet) throw new Error("DOCUMENT_ALLOCATION_MISMATCH");
      net += lineNet;
      tax += lineTax;
      gross += lineGross;
    }
    if (
      net !== BigInt(input.netMinor) ||
      tax !== BigInt(input.taxMinor) ||
      gross !== BigInt(input.grossMinor) ||
      gross !== net + tax
    )
      throw new Error("DOCUMENT_CONTROL_TOTAL_MISMATCH");
  }
}
