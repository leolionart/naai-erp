import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ExpenseService } from "./expense.service.js";
import type {
  CreateExpenseInput,
  ExpenseCategoryInput,
  ExpenseMetadataInput,
  ExpenseReviewInput,
  TaxFinalizationInput,
} from "./expense.types.js";

@Controller("api/v1/organizations/:organizationId/expenses")
export class ExpenseController {
  constructor(@Inject(ExpenseService) private readonly service: ExpenseService) {}
  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query("state") state?: string,
    @Query("class") expenseClass?: string,
    @Query("payeePartyId") payeePartyId?: string,
    @Query("fundingTreatment") fundingTreatment?: string,
    @Query("startsOn") startsOn?: string,
    @Query("endsOn") endsOn?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.list(await this.context(org, auth, corr), {
      ...(state ? { state } : {}),
      ...(expenseClass ? { expenseClass } : {}),
      ...(payeePartyId ? { payeePartyId } : {}),
      ...(fundingTreatment ? { fundingTreatment } : {}),
      ...(startsOn ? { startsOn } : {}),
      ...(endsOn ? { endsOn } : {}),
    });
  }
  @Post("tax-finalization/dry-run") async dryRunTaxFinalization(
    @Param("organizationId") org: string,
    @Body() input: TaxFinalizationInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.dryRunTaxFinalization(
      await this.context(org, auth, corr),
      input.reason ?? "",
    );
  }
  @Post("tax-finalization/commit") async commitTaxFinalization(
    @Param("organizationId") org: string,
    @Body() input: TaxFinalizationInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.commitTaxFinalization(
      await this.context(org, auth, corr),
      input.reason ?? "",
      input.planHash ?? "",
      key,
    );
  }
  @Get("relationship-backfill/inventory") async relationshipBackfillInventory(
    @Param("organizationId") org: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.relationshipBackfillInventory(await this.context(org, auth, corr));
  }
  @Get(":id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.get(await this.context(org, auth, corr), id);
  }
  @Patch(":id") async update(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: Partial<CreateExpenseInput>,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.update(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input,
      key,
    );
  }
  @Patch(":id/category") async updateCategory(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: ExpenseCategoryInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.updateCategory(await this.context(org, auth, corr), id, input, key);
  }
  @Patch(":id/metadata") async updateMetadata(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: ExpenseMetadataInput,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.updateMetadata(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input,
      key,
    );
  }
  @Post() async create(
    @Param("organizationId") org: string,
    @Body() input: CreateExpenseInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.create(await this.context(org, auth, corr), input, key);
  }
  @Delete(":id") async discard(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: { reason?: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.discard(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input.reason ?? "",
      key,
    );
  }
  @Post(":id/review") async review(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: ExpenseReviewInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.review(await this.context(org, auth, corr), id, input, key);
  }
  @Post(":id/reverse-replace") async reverseReplace(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: { replacement: CreateExpenseInput; reason: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.reverseReplace(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input.replacement,
      input.reason ?? "",
      key,
    );
  }
  @Post(":id/relationship-backfill/dry-run") async dryRunRelationshipBackfill(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: { replacement: CreateExpenseInput; reason: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.dryRunRelationshipBackfill(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input.replacement,
      input.reason ?? "",
    );
  }
  @Post(":id/relationship-backfill/commit") async commitRelationshipBackfill(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: { replacement: CreateExpenseInput; reason: string; planHash: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.commitRelationshipBackfill(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input.replacement,
      input.reason ?? "",
      input.planHash ?? "",
      key,
    );
  }
  @Post(":id/:action") async transition(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() input: { reason?: string; missingEvidenceTypes?: string[] },
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(await this.context(org, auth, corr), id, action, input, key);
  }
}
