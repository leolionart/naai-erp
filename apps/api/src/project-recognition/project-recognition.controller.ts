import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ProjectRecognitionService } from "./project-recognition.service.js";
import type { RecognitionResource } from "./project-recognition.types.js";

@Controller("api/v1/organizations/:organizationId")
export class ProjectRecognitionController {
  constructor(
    @Inject(ProjectRecognitionService) private readonly service: ProjectRecognitionService,
  ) {}
  private context(org: string, auth?: string, correlation?: string) {
    return this.service.authenticate(auth, org, correlation ?? randomUUID());
  }
  @Get("project-revenue-position/:projectId") async position(
    @Param("organizationId") o: string,
    @Param("projectId") p: string,
    @Query("asOf") asOf?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.position(await this.context(o, a, c), p, asOf);
  }
  @Get(
    ":resource(scope-changes|project-budgets|recognition-policies|milestone-acceptances|revenue-recognition-events)",
  )
  async list(
    @Param("organizationId") o: string,
    @Param("resource") r: RecognitionResource,
    @Query("projectId") p?: string,
    @Query("state") state?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.list(await this.context(o, a, c), r, p, state);
  }
  @Get(
    ":resource(scope-changes|project-budgets|recognition-policies|milestone-acceptances|revenue-recognition-events)/:id",
  )
  async get(
    @Param("organizationId") o: string,
    @Param("resource") r: RecognitionResource,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.get(await this.context(o, a, c), r, id);
  }
  @Post(
    ":resource(scope-changes|project-budgets|recognition-policies|milestone-acceptances|revenue-recognition-events)",
  )
  async create(
    @Param("organizationId") o: string,
    @Param("resource") r: RecognitionResource,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.create(await this.context(o, a, c), r, i, k);
  }
  @Post(
    ":resource(scope-changes|project-budgets|recognition-policies|milestone-acceptances|revenue-recognition-events)/:id/:action",
  )
  async transition(
    @Param("organizationId") o: string,
    @Param("resource") r: RecognitionResource,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.transition(await this.context(o, a, c), r, id, action, i, k);
  }
}
