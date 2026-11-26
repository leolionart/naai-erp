import { Body, Controller, Get, Headers, Inject, Param, Patch, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PaymentEvidenceService } from "./payment-evidence.service.js";
import type { UpdatePaymentEvidenceInput } from "./payment-evidence.types.js";

@Controller("api/v1/organizations/:organizationId")
export class PaymentEvidenceController {
  constructor(@Inject(PaymentEvidenceService) private readonly service: PaymentEvidenceService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get("reports/tax/payment-evidence-gaps")
  async paymentEvidenceGaps(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.reportGaps(
      await this.context(organizationId, authorization, correlationId),
      query,
    );
  }

  @Patch("expenses/:id/payment-evidence")
  async updateExpensePaymentEvidence(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: UpdatePaymentEvidenceInput,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.updateExpense(
      await this.context(organizationId, authorization, correlationId),
      id,
      expectedVersion,
      input,
      idempotencyKey,
    );
  }

  @Patch("commercial-documents/:id/payment-evidence")
  async updateDocumentPaymentEvidence(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: UpdatePaymentEvidenceInput,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.updateDocument(
      await this.context(organizationId, authorization, correlationId),
      id,
      expectedVersion,
      input,
      idempotencyKey,
    );
  }
}
