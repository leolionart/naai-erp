import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DraftRecordingService } from "../draft-recording/draft-recording.service.js";
import type { RecordSingleDraftInput } from "../draft-recording/draft-recording.types.js";
import { ExpenseService } from "./expense.service.js";
import type {
  CreateExpenseInput,
  ExpenseCategoryInput,
  ExpenseCorrectionInput,
  ExpenseMetadataInput,
  ExpenseReviewInput,
  TaxFinalizationInput,
  FundingInferenceInput,
} from "./expense.types.js";

@Controller("api/v1/organizations/:organizationId/expenses")
export class ExpenseController {
  constructor(
    @Inject(ExpenseService) private readonly service: ExpenseService,
    @Optional()
    @Inject(DraftRecordingService)
    private readonly draftRecording?: DraftRecordingService,
  ) {}
  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }
  private filters(q: Record<string, string | undefined>) {
    const keys = [
      "state",
      "expenseClass",
      "payeePartyId",
      "fundingTreatment",
      "startsOn",
      "endsOn",
      "q",
    ];
    const alias: Record<string, string> = { expenseClass: "class" };
    return Object.fromEntries(
      keys.flatMap((key) => {
        const value = q[alias[key] ?? key];
        return value ? [[key, value]] : [];
      }),
    );
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.list(await this.context(org, auth, corr), this.filters(query), query);
  }
  @Get("count") async count(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.count(await this.context(org, auth, corr), this.filters(query));
  }
  @Get("summary") async summary(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.summary(
      await this.context(org, auth, corr),
      this.filters(query),
      query.groupBy,
    );
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
  @Post("funding-inference/dry-run") async dryRunFundingInference(
    @Param("organizationId") org: string,
    @Body() input: FundingInferenceInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.dryRunFundingInference(
      await this.context(org, auth, corr),
      input.reason ?? "",
    );
  }
  @Post("funding-inference/commit") async commitFundingInference(
    @Param("organizationId") org: string,
    @Body() input: FundingInferenceInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.commitFundingInference(
      await this.context(org, auth, corr),
      input.reason ?? "",
      input.planHash ?? "",
      key,
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
  @Patch(":id/correction") async correct(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: ExpenseCorrectionInput,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.correct(
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
  @Post(":id/reclassify-funding") async reclassifyFunding(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body()
    input: {
      financialAccountId?: string;
      counterAccountCode?: string;
      postReplacement?: boolean;
      reason?: string;
    },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.reclassifyFunding(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input ?? {},
      key,
    );
  }
  @Post("by-external/:system/:externalId/reclassify-funding")
  async reclassifyFundingByExternal(
    @Param("organizationId") org: string,
    @Param("system") system: string,
    @Param("externalId") externalId: string,
    @Body()
    input: {
      financialAccountId?: string;
      counterAccountCode?: string;
      postReplacement?: boolean;
      reason?: string;
    },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.reclassifyFundingByExternal(
      await this.context(org, auth, corr),
      system,
      externalId,
      expectedVersion ?? "",
      input ?? {},
      key,
    );
  }
  @Post(":id/reclassify-accounts")
  async reclassifyAccounts(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body()
    input: {
      lines: ReadonlyArray<{
        lineNumber: number;
        postingAccountCode?: string;
        categoryCode?: string;
      }>;
      postReplacement?: boolean;
      reason?: string;
    },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.reclassifyAccounts(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
      input ?? { lines: [] },
      key,
    );
  }
  @Post(":id/reverse") async reverse(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: { reason?: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.reverse(
      await this.context(org, auth, corr),
      id,
      expectedVersion ?? "",
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
  @Post(":id/record")
  @HttpCode(200)
  async record(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: RecordSingleDraftInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    if (!this.draftRecording) throw new Error("INTERNAL_ERROR");
    return this.draftRecording.recordExpense(
      await this.context(org, auth, corr),
      id,
      input ?? {},
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
