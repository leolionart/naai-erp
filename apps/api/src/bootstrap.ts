import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";

type BootstrapEnvironment = Readonly<{ NODE_ENV?: string; WEB_ORIGIN?: string }>;

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
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: environment.NODE_ENV === "test" ? false : ["error", "warn", "log"],
    rawBody: true,
  });
  const origin = webOrigin(environment);
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
  return app;
}
