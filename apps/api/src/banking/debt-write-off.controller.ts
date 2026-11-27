import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  executeOwnerDebtWriteOff,
  executeSalesInvoiceBadDebtWriteOff,
  type OwnerDebtWriteOffInput,
  type SalesInvoiceWriteOffInput,
} from "./debt-write-off.helper.js";

const WRITE_OFF_ROLES = new Set(["owner", "finance_admin", "accountant"]);

@Controller("api/v1/organizations/:organizationId")
export class DebtWriteOffController {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(@Inject(MasterDataService) private readonly master: MasterDataService) {}

  private async authorize(
    organizationId: string,
    authorization?: string,
    correlationId?: string,
    idempotencyKey?: string,
  ) {
    const context = await this.master.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    if (!context.roles.some((r) => WRITE_OFF_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return { context, key: idempotencyKey.trim() };
  }

  private envelope(organizationId: string, correlationId: string, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: correlationId,
      organizationId,
      data,
    };
  }

  @Post("banking/owner-debt-write-offs")
  async writeOffOwnerDebt(
    @Param("organizationId") organizationId: string,
    @Body() input: OwnerDebtWriteOffInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const { context, key } = await this.authorize(
      organizationId,
      authorization,
      correlationId,
      idempotencyKey,
    );
    const data = await executeOwnerDebtWriteOff(this.pool, context, input, key);
    return this.envelope(context.organizationId, context.correlationId, data);
  }

  @Post("commercial-documents/:id/write-off")
  async writeOffSalesInvoice(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: SalesInvoiceWriteOffInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const { context, key } = await this.authorize(
      organizationId,
      authorization,
      correlationId,
      idempotencyKey,
    );
    const data = await executeSalesInvoiceBadDebtWriteOff(this.pool, context, id, input, key);
    return this.envelope(context.organizationId, context.correlationId, data);
  }
}
