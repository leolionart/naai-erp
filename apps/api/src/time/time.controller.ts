import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MasterDataService } from "../master-data/master-data.service.js";

/** Compatibility endpoint for time/expense forms. The canonical source is master-data. */
@Controller("api/v1/organizations/:organizationId/time")
export class TimeController {
  constructor(@Inject(MasterDataService) private readonly master: MasterDataService) {}

  @Get("workers")
  async workers(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const context = await this.master.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.master.list(
      "workforce-profiles",
      context,
      cursor,
      Number.parseInt(limit ?? "100", 10),
      { active: true },
    );
  }
}
