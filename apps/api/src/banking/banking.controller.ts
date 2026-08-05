import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BankingService } from "./banking.service.js";
import type {
  BankTransactionActionInput,
  CreateFinancialAccountInput,
  ImportBankStatementInput,
} from "./banking.types.js";

@Controller("api/v1/organizations/:organizationId/banking")
export class BankingController {
  constructor(@Inject(BankingService) private readonly service: BankingService) {}
  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }
  @Get("accounts") async listAccounts(
    @Param("organizationId") org: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.listAccounts(await this.context(org, auth, corr));
  }
  @Get("accounts/:id") async getAccount(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.getAccount(await this.context(org, auth, corr), id);
  }
  @Post("accounts") async createAccount(
    @Param("organizationId") org: string,
    @Body() input: CreateFinancialAccountInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.createAccount(await this.context(org, auth, corr), input, key);
  }
  @Post("accounts/:id/deactivate") async deactivateAccount(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: BankTransactionActionInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.deactivateAccount(await this.context(org, auth, corr), id, input, key);
  }
  @Post("imports") async importStatement(
    @Param("organizationId") org: string,
    @Body() input: ImportBankStatementInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.importStatement(await this.context(org, auth, corr), input, key);
  }
  @Post("imports/dry-run") async dryRunImport(
    @Param("organizationId") org: string,
    @Body() input: ImportBankStatementInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.dryRunImport(await this.context(org, auth, corr), input);
  }
  @Get("imports") async listImports(
    @Param("organizationId") org: string,
    @Query("financialAccountId") accountId?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.listImports(await this.context(org, auth, corr), accountId);
  }
  @Get("imports/:id") async getImport(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.getImport(await this.context(org, auth, corr), id);
  }
  @Get("transactions") async listTransactions(
    @Param("organizationId") org: string,
    @Query("financialAccountId") accountId?: string,
    @Query("state") state?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.listTransactions(await this.context(org, auth, corr), {
      ...(accountId ? { financialAccountId: accountId } : {}),
      ...(state ? { state } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  }
  @Get("transactions/:id") async getTransaction(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.getTransaction(await this.context(org, auth, corr), id);
  }
  @Post("transactions/:id/:action") async transitionTransaction(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() input: BankTransactionActionInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transitionTransaction(
      await this.context(org, auth, corr),
      id,
      action,
      input,
      key,
    );
  }
}
