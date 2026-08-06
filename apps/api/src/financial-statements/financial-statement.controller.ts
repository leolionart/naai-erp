import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FinancialStatementService } from "./financial-statement.service.js";
import type { StatementKind } from "./financial-statement.types.js";

@Controller("api/v1/organizations/:organizationId")
export class FinancialStatementController {
  constructor(
    @Inject(FinancialStatementService) private readonly service: FinancialStatementService,
  ) {}
  private context(org: string, auth?: string, correlation?: string) {
    return this.service.authenticate(auth, org, correlation ?? randomUUID());
  }
  @Get("financial-statement-mappings") async list(
    @Param("organizationId") org: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.listMappings(await this.context(org, auth, correlation));
  }
  @Get("financial-statement-mappings/:id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Query("version") version?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.getMapping(
      await this.context(org, auth, correlation),
      id,
      version ? Number(version) : undefined,
    );
  }
  @Post("financial-statement-mappings") async create(
    @Param("organizationId") org: string,
    @Body() body: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.createMapping(
      await this.context(org, auth, correlation),
      this.service.parseMapping(body),
      key,
    );
  }
  @Post("financial-statement-mappings/:id/versions/:version/approve") async approve(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Param("version") version: string,
    @Body() body: { reason?: string },
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.approveMapping(
      await this.context(org, auth, correlation),
      id,
      Number(version),
      body.reason ?? "",
      key,
    );
  }
  private async statement(
    kind: StatementKind,
    org: string,
    query: Record<string, string | undefined>,
    auth?: string,
    correlation?: string,
  ) {
    const q = this.service.parseQuery(query, kind === "balance_sheet");
    if (kind === "profit_and_loss" && q.basis !== "accrual") throw new Error("VALIDATION_FAILED");
    return this.service.report(await this.context(org, auth, correlation), kind, q);
  }
  @Get("reports/financial-statements/profit-and-loss") pnl(
    @Param("organizationId") org: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.statement("profit_and_loss", org, q, a, c);
  }
  @Get("reports/financial-statements/balance-sheet") bs(
    @Param("organizationId") org: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.statement("balance_sheet", org, q, a, c);
  }
  @Get("reports/financial-statements/cash-flow") cf(
    @Param("organizationId") org: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.statement("cash_flow", org, q, a, c);
  }
  @Get("reports/tax/vat-reconciliation") vat(
    @Param("organizationId") org: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.statement("vat_reconciliation", org, q, a, c);
  }
  @Get("reports/tax/expense-exceptions") async expenseExceptions(
    @Param("organizationId") org: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.expenseExceptions(
      await this.context(org, a, c),
      this.service.parseQuery(q),
      q.state,
    );
  }
  @Get("reports/financial-statements/drilldown") async drilldown(
    @Param("organizationId") org: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    if (!kinds.has(q.statement ?? "") || !q.lineCode) throw new Error("VALIDATION_FAILED");
    return this.service.drilldown(await this.context(org, a, c), {
      ...this.service.parseQuery(q, q.statement === "balance_sheet"),
      statement: q.statement as StatementKind,
      lineCode: q.lineCode,
    });
  }
}
const kinds = new Set(["profit_and_loss", "balance_sheet", "cash_flow", "vat_reconciliation"]);
