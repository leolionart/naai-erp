import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
  UpdateCommercialDocumentInput,
  ExternalReferenceInput,
} from "./commercial-document.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE_ROLES = new Set(["owner", "finance_admin", "accountant", "approver"]);
const POST_ROLES = new Set(["owner", "finance_admin", "accountant"]);

interface ExistingDocument {
  type: string;
  document_number: string;
  series: string | null;
  fiscal_year: number;
  party_id: string;
  document_date: Date | string;
  due_date: Date | string;
  currency: string;
  net_minor: string | number;
  tax_minor: string | number;
  gross_minor: string | number;
  control_account_code: string;
  original_document_id: string | null;
  reason: string | null;
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
    originalLineNumber?: number;
    description: string;
    quantity: string | number;
    unitPriceMinor: string | number;
    netMinor: string | number;
    taxMinor: string | number;
    grossMinor: string | number;
    primaryAccountCode: string;
    taxAccountCode?: string;
    taxCode?: string;
    dimensions?: Record<string, string>;
    allocations: Array<{
      id?: string;
      amount_minor: string | number;
      dimensions?: Record<string, string>;
    }>;
  }>;
}

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
  async list(
    context: CommercialDocumentContext,
    type?: string,
    state?: string,
    partyId?: string,
    projectId?: string,
  ) {
    return this.envelope(context, {
      items: await this.store.list(context.organizationId, {
        ...(type ? { type } : {}),
        ...(state ? { state } : {}),
        ...(partyId ? { partyId } : {}),
        ...(projectId ? { projectId } : {}),
      }),
    });
  }
  async get(context: CommercialDocumentContext, id: string) {
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
  async update(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: UpdateCommercialDocumentInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");

    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
    if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

    const merged = this.mergeDocument(existing, input);
    this.validate(merged);

    return this.envelope(
      context,
      await this.store.update(context, id, expectedVersion, merged, idempotencyKey),
    );
  }

  private mergeDocument(
    existing: ExistingDocument,
    input: UpdateCommercialDocumentInput,
  ): CreateCommercialDocumentInput {
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
      const originalLineVal = l.lineNumber || l.originalLineNumber;
      const line: CreateCommercialDocumentInput["lines"][number] = {
        description: l.description,
        quantity: String(l.quantity),
        unitPriceMinor: String(l.unitPriceMinor),
        netMinor: String(l.netMinor),
        taxMinor: String(l.taxMinor),
        grossMinor: String(l.grossMinor),
        primaryAccountCode: l.primaryAccountCode,
        dimensions: l.dimensions || {},
        allocations,
        ...(typeof originalLineVal === "number" ? { originalLineNumber: originalLineVal } : {}),
        ...(l.taxAccountCode ? { taxAccountCode: l.taxAccountCode } : {}),
        ...(l.taxCode ? { taxCode: l.taxCode } : {}),
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

    const seriesVal = input.series !== undefined ? input.series : existing.series;
    const origId =
      input.originalDocumentId !== undefined
        ? input.originalDocumentId
        : existing.original_document_id;
    const reasonVal = input.reason !== undefined ? input.reason : existing.reason;

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

    const result: CreateCommercialDocumentInput = {
      type: (input.type !== undefined
        ? input.type
        : existing.type) as CreateCommercialDocumentInput["type"],
      documentNumber:
        input.documentNumber !== undefined ? input.documentNumber : existing.document_number,
      fiscalYear: input.fiscalYear !== undefined ? input.fiscalYear : existing.fiscal_year,
      partyId: input.partyId !== undefined ? input.partyId : existing.party_id,
      documentDate:
        input.documentDate !== undefined ? input.documentDate : formatDate(existing.document_date),
      dueDate: input.dueDate !== undefined ? input.dueDate : formatDate(existing.due_date),
      currency: input.currency !== undefined ? input.currency : existing.currency,
      netMinor: input.netMinor !== undefined ? input.netMinor : String(existing.net_minor),
      taxMinor: input.taxMinor !== undefined ? input.taxMinor : String(existing.tax_minor),
      grossMinor: input.grossMinor !== undefined ? input.grossMinor : String(existing.gross_minor),
      controlAccountCode:
        input.controlAccountCode !== undefined
          ? input.controlAccountCode
          : existing.control_account_code,
      lines: input.lines !== undefined ? input.lines : existingLines,
      ...(seriesVal ? { series: seriesVal } : {}),
      ...(origId ? { originalDocumentId: origId } : {}),
      ...(reasonVal ? { reason: reasonVal } : {}),
      ...(cleanedExtRef ? { externalReference: cleanedExtRef } : {}),
    };

    return result;
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
      (input.migrationSourceExpenseId || input.migrationSourceExpenseDate) &&
      (input.type !== "purchase_invoice" ||
        !input.migrationSourceExpenseId ||
        !input.migrationSourceExpenseDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.migrationSourceExpenseDate))
    )
      throw new Error("MIGRATION_SOURCE_EXPENSE_INVALID");
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

    if (input.externalReference) {
      if (!input.externalReference.system?.trim() || !input.externalReference.externalId?.trim()) {
        throw new Error("VALIDATION_FAILED");
      }
    }
  }
}
