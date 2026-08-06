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
import { ForecastComponentService } from "./forecast-component.service.js";

@Controller("api/v1/organizations/:organizationId/forecast-versions/:forecastId")
export class ForecastComponentController {
  constructor(
    @Inject(ForecastComponentService) private readonly service: ForecastComponentService,
  ) {}
  private context(org: string, auth?: string, correlation?: string) {
    return this.service.authenticate(auth, org, correlation ?? randomUUID());
  }
  @Get("components") async list(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.list(await this.context(org, auth, correlation), forecastId, query);
  }
  @Get("components/:id") async get(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.get(await this.context(org, auth, correlation), forecastId, id);
  }
  @Get("composition") async composition(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.composition(await this.context(org, auth, correlation), forecastId);
  }
  @Post("components") async create(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.create(await this.context(org, auth, correlation), forecastId, input, key);
  }
  @Patch("components/:id") async update(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Param("id") id: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.update(
      await this.context(org, auth, correlation),
      forecastId,
      id,
      input,
      key,
    );
  }
  @Delete("components/:id") async remove(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Param("id") id: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.remove(
      await this.context(org, auth, correlation),
      forecastId,
      id,
      input,
      key,
    );
  }
  @Post("components/:id/:action") async transition(
    @Param("organizationId") org: string,
    @Param("forecastId") forecastId: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(
      await this.context(org, auth, correlation),
      forecastId,
      id,
      action,
      input,
      key,
    );
  }
}
