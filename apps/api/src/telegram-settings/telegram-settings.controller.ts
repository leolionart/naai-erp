import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { TelegramSettingsService } from "./telegram-settings.service.js";
import type { UpdateTelegramSettingsInput } from "./telegram-settings.types.js";

@Controller("api/v1/organizations/:organizationId/telegram-settings")
export class TelegramSettingsController {
  constructor(@Inject(TelegramSettingsService) private readonly service: TelegramSettingsService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get()
  async get(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.get(await this.context(organizationId, authorization, correlationId));
  }

  @Patch()
  async update(
    @Param("organizationId") organizationId: string,
    @Body() input: UpdateTelegramSettingsInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.update(
      await this.context(organizationId, authorization, correlationId),
      input ?? {},
    );
  }

  @Post("test")
  async test(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.sendTest(await this.context(organizationId, authorization, correlationId));
  }
}
