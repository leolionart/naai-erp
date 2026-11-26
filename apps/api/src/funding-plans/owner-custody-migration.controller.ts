import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  OwnerCustodyMigrationService,
  type OwnerCustodyMigrationCommitRequest,
  type OwnerCustodyMigrationDryRunRequest,
} from "./owner-custody-migration.service.js";

@Controller("api/v1/organizations/:organizationId/funding-plans/owner-custody-migration")
export class OwnerCustodyMigrationController {
  constructor(
    @Inject(OwnerCustodyMigrationService) private readonly service: OwnerCustodyMigrationService,
  ) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Post("dry-run")
  async dryRun(
    @Param("organizationId") organizationId: string,
    @Body() body: OwnerCustodyMigrationDryRunRequest,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.dryRun(
      await this.context(organizationId, authorization, correlationId),
      body ?? {},
    );
  }

  @Post("commit")
  async commit(
    @Param("organizationId") organizationId: string,
    @Body() body: OwnerCustodyMigrationCommitRequest,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.commit(
      await this.context(organizationId, authorization, correlationId),
      body ?? { planHash: "", reason: "" },
      idempotencyKey,
    );
  }
}
