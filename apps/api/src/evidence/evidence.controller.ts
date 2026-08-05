import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EvidenceService } from "./evidence.service.js";
import type {
  DownloadEvidenceInput,
  ReviewEvidenceInput,
  UploadEvidenceInput,
} from "./evidence.types.js";

@Controller("api/v1/organizations/:organizationId/evidence")
export class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly service: EvidenceService) {}
  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query("subjectType") subjectType?: string,
    @Query("subjectId") subjectId?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.list(await this.context(org, auth, corr), subjectType, subjectId);
  }
  @Get(":id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.get(await this.context(org, auth, corr), id);
  }
  @Post() async upload(
    @Param("organizationId") org: string,
    @Body() input: UploadEvidenceInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.upload(await this.context(org, auth, corr), input, key);
  }
  @Post(":id/review") async review(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: ReviewEvidenceInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.review(await this.context(org, auth, corr), id, input, key);
  }
  @Post(":id/download-url") async download(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: DownloadEvidenceInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.download(await this.context(org, auth, corr), id, input, key);
  }
}
