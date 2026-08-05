import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AgingService } from "./aging.service.js";

@Controller("api/v1/organizations/:organizationId/reports")
export class AgingController {
  constructor(@Inject(AgingService) private readonly service: AgingService) {}
  private context(org: string, auth?: string, correlationId?: string) {
    return this.service.authenticate(auth, org, correlationId ?? randomUUID());
  }
  private query(values: Record<string, string | undefined>) {
    return this.service.parseQuery(values);
  }
  private async reportSide(
    side: "ar" | "ap",
    org: string,
    values: Record<string, string | undefined>,
    auth?: string,
    correlationId?: string,
  ) {
    return this.service.report(
      await this.context(org, auth, correlationId),
      side,
      this.query(values),
    );
  }
  private async partySide(
    side: "ar" | "ap",
    org: string,
    partyId: string,
    values: Record<string, string | undefined>,
    auth?: string,
    correlationId?: string,
  ) {
    return this.service.report(
      await this.context(org, auth, correlationId),
      side,
      this.query({ ...values, partyId }),
    );
  }
  private async itemSide(
    side: "ar" | "ap",
    org: string,
    itemId: string,
    values: Record<string, string | undefined>,
    auth?: string,
    correlationId?: string,
  ) {
    return this.service.item(
      await this.context(org, auth, correlationId),
      side,
      itemId,
      this.query({ ...values, limit: "100", includeSettled: "true" }),
    );
  }
  @Get("ar-aging")
  ar(
    @Param("organizationId") org: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.reportSide("ar", org, values, auth, correlationId);
  }
  @Get("ap-aging")
  ap(
    @Param("organizationId") org: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.reportSide("ap", org, values, auth, correlationId);
  }
  @Get("ar-aging/parties/:partyId")
  arParty(
    @Param("organizationId") org: string,
    @Param("partyId") partyId: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.partySide("ar", org, partyId, values, auth, correlationId);
  }
  @Get("ap-aging/parties/:partyId")
  apParty(
    @Param("organizationId") org: string,
    @Param("partyId") partyId: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.partySide("ap", org, partyId, values, auth, correlationId);
  }
  @Get("ar-aging/items/:itemId")
  arItem(
    @Param("organizationId") org: string,
    @Param("itemId") itemId: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.itemSide("ar", org, itemId, values, auth, correlationId);
  }
  @Get("ap-aging/items/:itemId")
  apItem(
    @Param("organizationId") org: string,
    @Param("itemId") itemId: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.itemSide("ap", org, itemId, values, auth, correlationId);
  }
}
