import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LedgerReportService } from "./ledger-report.service.js";
import type { OpeningBalanceInput } from "./ledger-report.types.js";

@Controller("api/v1/organizations/:organizationId")
export class LedgerReportController {
  constructor(@Inject(LedgerReportService) private readonly service: LedgerReportService) {}
  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }
  @Get("reports/trial-balance")
  async trialBalance(
    @Param("organizationId") organizationId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.trialBalance(
      await this.context(organizationId, authorization, correlationId),
      { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    );
  }
  @Get("reports/general-ledger")
  async generalLedger(
    @Param("organizationId") organizationId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("accountCode") accountCode?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.generalLedger(
      await this.context(organizationId, authorization, correlationId),
      {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(accountCode ? { accountCode } : {}),
      },
    );
  }
  @Post("opening-balances/dry-run")
  async dryRun(
    @Param("organizationId") organizationId: string,
    @Body() input: OpeningBalanceInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.dryRunOpeningBalance(
      await this.context(organizationId, authorization, correlationId),
      input,
    );
  }
  @Get("opening-balances")
  async listOpeningBalances(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.listOpeningBalances(
      await this.context(organizationId, authorization, correlationId),
    );
  }
  @Get("opening-balances/:importId")
  async getOpeningBalance(
    @Param("organizationId") organizationId: string,
    @Param("importId") importId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getOpeningBalance(
      await this.context(organizationId, authorization, correlationId),
      importId,
    );
  }
  @Post("opening-balances")
  async create(
    @Param("organizationId") organizationId: string,
    @Body() input: OpeningBalanceInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.createOpeningBalance(
      await this.context(organizationId, authorization, correlationId),
      input,
      idempotencyKey,
    );
  }
}
