import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgPaymentEvidenceStore } from "./pg-payment-evidence.store.js";
import type {
  PaymentEvidenceContext,
  UpdatePaymentEvidenceInput,
} from "./payment-evidence.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class PaymentEvidenceService {
  constructor(
    @Inject(PgPaymentEvidenceStore) private readonly store: PgPaymentEvidenceStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: PaymentEvidenceContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  parseRange(query: Record<string, string | undefined>) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const endsOn = (query.endsOn ?? query.to ?? todayStr).slice(0, 10);
    const startsOn = (query.startsOn ?? query.from ?? `${endsOn.slice(0, 4)}-01-01`).slice(0, 10);
    if (!ISO_DATE.test(startsOn) || !ISO_DATE.test(endsOn) || startsOn > endsOn) {
      throw new Error("VALIDATION_FAILED");
    }
    return { startsOn, endsOn };
  }

  async reportGaps(context: PaymentEvidenceContext, query: Record<string, string | undefined>) {
    const range = this.parseRange(query);
    return this.envelope(
      context,
      await this.store.reportPaymentEvidenceGaps(context.organizationId, range),
    );
  }

  async updateExpense(
    context: PaymentEvidenceContext,
    expenseId: string,
    expectedVersion: string | undefined,
    input: UpdatePaymentEvidenceInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    return this.envelope(
      context,
      await this.store.updateExpensePaymentEvidence(
        context,
        expenseId,
        expectedVersion,
        input ?? {},
        idempotencyKey,
      ),
    );
  }

  async updateDocument(
    context: PaymentEvidenceContext,
    documentId: string,
    expectedVersion: string | undefined,
    input: UpdatePaymentEvidenceInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    return this.envelope(
      context,
      await this.store.updateDocumentPaymentEvidence(
        context,
        documentId,
        expectedVersion,
        input ?? {},
        idempotencyKey,
      ),
    );
  }
}
