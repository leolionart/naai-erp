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
    try {
      return await this.master.list(
        "workforce-profiles",
        context,
        cursor,
        Number.parseInt(limit ?? "100", 10),
        { active: true },
      );
    } catch (error) {
      // Workforce profiles were removed with the obsolete timesheet subsystem (ERP-905).
      // Return an empty compatibility list when the legacy table is absent.
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      if (
        code === "42P01" ||
        (error instanceof Error && /workforce_profiles/i.test(error.message))
      ) {
        return { apiVersion: "v1", requestId: context.correlationId, organizationId, items: [] };
      }
      throw error;
    }
  }
}
