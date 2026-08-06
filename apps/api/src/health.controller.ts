import { Controller, Get, Inject, Injectable, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import pg from "pg";

export type HealthResponse = {
  service: "api";
  status: "ok" | "unavailable";
};

@Injectable()
export class DatabaseReadinessService {
  async ready(): Promise<boolean> {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) return false;

    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 2_000,
      query_timeout: 2_000,
      statement_timeout: 2_000,
    });
    try {
      await client.connect();
      await client.query("select 1");
      return true;
    } catch {
      return false;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseReadinessService) private readonly database: DatabaseReadinessService,
  ) {}

  @Get("live")
  live(): HealthResponse {
    return { service: "api", status: "ok" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) response: FastifyReply): Promise<HealthResponse> {
    if (!(await this.database.ready())) {
      response.status(503);
      return { service: "api", status: "unavailable" };
    }
    return { service: "api", status: "ok" };
  }
}
