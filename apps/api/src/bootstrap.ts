import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";
import multipart from "@fastify/multipart";
import { authenticateApiSession, SessionAuthenticationError } from "./auth/session-cookie-auth.js";
import { RequestLifecycleInterceptor } from "./operational-logs/request-lifecycle.interceptor.js";
import {
  OPERATIONAL_LOG_STORE,
  type OperationalLogStore,
} from "./operational-logs/operational-log.types.js";
import { randomUUID } from "node:crypto";

type BootstrapEnvironment = Readonly<{
  NODE_ENV?: string;
  WEB_ORIGIN?: string;
  API_BODY_LIMIT_BYTES?: string;
  SESSION_SECRET?: string;
  APP_BASE_URL?: string;
}>;

export function apiBodyLimit(environment: BootstrapEnvironment = process.env): number {
  const configured = environment.API_BODY_LIMIT_BYTES?.trim();
  if (!configured) return 5 * 1024 * 1024;
  const limit = Number(configured);
  if (!Number.isSafeInteger(limit) || limit < 1024 * 1024)
    throw new Error("API_BODY_LIMIT_BYTES must be an integer of at least 1048576 bytes");
  return limit;
}

export function webOrigin(environment: BootstrapEnvironment = process.env): string | undefined {
  const configured = environment.WEB_ORIGIN?.trim();
  if (configured) {
    const origin = new URL(configured);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("WEB_ORIGIN must be an HTTP(S) origin without a path, query or fragment");
    return origin.origin;
  }
  return (environment.NODE_ENV ?? "development") === "development"
    ? "http://localhost:3000"
    : undefined;
}

export async function createApp(
  options: { environment?: BootstrapEnvironment } = {},
): Promise<NestFastifyApplication> {
  const environment = options.environment ?? process.env;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: apiBodyLimit(environment) }),
    {
      logger: environment.NODE_ENV === "test" ? false : ["error", "warn", "log"],
      rawBody: true,
    },
  );
  const origin = webOrigin(environment);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", async (request, reply) => {
      try {
        authenticateApiSession(request, environment);
      } catch (error) {
        if (!(error instanceof SessionAuthenticationError)) throw error;
        const organizationId =
          (request.params as Record<string, string> | undefined)?.organizationId ??
          request.url.match(/\/organizations\/([^/?]+)/)?.[1];
        const correlationId =
          request.headers["x-correlation-id"] ?? request.headers["X-Correlation-Id"];
        if (organizationId) {
          const store = app.get<OperationalLogStore>(OPERATIONAL_LOG_STORE);
          const id = randomUUID();
          try {
            await store.start?.({
              organizationId,
              id,
              service: "api",
              operation: request.method,
              correlationId: typeof correlationId === "string" ? correlationId : null,
              summary: `${request.method} ${request.url} failed authentication`,
              details: { code: error.code, status: error.statusCode, stage: "authentication" },
            });
            await store.finish?.(organizationId, id, {
              status: "failed",
              severity: "error",
              details: { code: error.code, status: error.statusCode, stage: "authentication" },
            });
          } catch {
            // Logging must never prevent the auth response.
          }
        }
        await reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.code,
          },
        });
      }
    });
  await app.register(multipart as never, {
    limits: { fileSize: apiBodyLimit(environment), files: 1 },
  });
  if (origin) {
    app.enableCors({
      origin,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "X-Correlation-Id",
        "Idempotency-Key",
        "If-Match",
      ],
    });
  }
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(app.get(RequestLifecycleInterceptor));
  return app;
}
