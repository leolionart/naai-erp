import { Inject, Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { catchError, defer, mergeMap, of, throwError } from "rxjs";
import { randomUUID } from "node:crypto";
import { OPERATIONAL_LOG_STORE, type OperationalLogStore } from "./operational-log.types.js";

const READ_ONLY_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_LARGE_RESPONSE_BYTES = 1024 * 1024;

/** Size and record count of a response body, used for BR-READ-003 observability. */
export function measureResponse(value: unknown): { responseBytes: number; itemCount?: number } {
  const responseBytes = Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  const data = (value as { data?: { items?: unknown } } | undefined)?.data;
  const items = Array.isArray(data) ? data : data?.items;
  return Array.isArray(items) ? { responseBytes, itemCount: items.length } : { responseBytes };
}

function largeResponseThreshold(): number {
  const parsed = Number.parseInt(process.env.API_LARGE_RESPONSE_WARN_BYTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LARGE_RESPONSE_BYTES;
}

/** Records one lifecycle activity for state-changing organization-scoped HTTP requests. */
@Injectable()
export class RequestLifecycleInterceptor implements NestInterceptor {
  constructor(@Inject(OPERATIONAL_LOG_STORE) private readonly store: OperationalLogStore) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      params?: Record<string, string>;
      headers?: Record<string, string | undefined>;
    }>();
    const organizationId = request.params?.organizationId;
    const method = (request.method ?? "REQUEST").toUpperCase();
    if (!organizationId || !this.store.start || !this.store.finish) return next.handle();
    if (READ_ONLY_HTTP_METHODS.has(method)) {
      return method === "GET" ? this.warnOnLargeRead(request, organizationId, next) : next.handle();
    }
    const id = randomUUID();
    const operation = `${method} ${request.url ?? ""}`.slice(0, 240);
    const correlationId =
      request.headers?.["x-correlation-id"] ?? request.headers?.["X-Correlation-Id"];
    const start = defer(() =>
      this.store.start!({
        organizationId,
        id,
        service: "api",
        operation: method,
        correlationId: correlationId ?? null,
        summary: `${operation} started`,
        details: { path: request.url ?? null },
      }),
    ).pipe(catchError(() => of(undefined)));
    return start.pipe(
      mergeMap(() => next.handle()),
      mergeMap((value) =>
        defer(() =>
          this.store.finish!(organizationId, id, {
            status: "succeeded",
            summary: `${operation} succeeded`,
            details: measureResponse(value),
          }),
        ).pipe(
          catchError(() => of(undefined)),
          mergeMap(() => [value]),
        ),
      ),
      catchError((error: unknown) =>
        defer(() =>
          this.store.finish!(organizationId, id, {
            status: "failed",
            severity: "error",
            summary: `${operation} failed`,
            details: { error: error instanceof Error ? error.message : "INTERNAL_ERROR" },
          }),
        ).pipe(
          catchError(() => of(undefined)),
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  /** Reads are not logged unless the response exceeds the large-response threshold. */
  private warnOnLargeRead(
    request: { url?: string; headers?: Record<string, string | undefined> },
    organizationId: string,
    next: CallHandler,
  ) {
    return next.handle().pipe(
      mergeMap((value) => {
        const measured = measureResponse(value);
        if (measured.responseBytes < largeResponseThreshold()) return [value];
        const id = randomUUID();
        const path = (request.url ?? "").slice(0, 240);
        return defer(async () => {
          await this.store.start!({
            organizationId,
            id,
            service: "api",
            operation: "GET",
            correlationId: request.headers?.["x-correlation-id"] ?? null,
            summary: `GET ${path} returned a large response`,
            details: { path, ...measured },
          });
          await this.store.finish!(organizationId, id, {
            status: "succeeded",
            severity: "warning",
            summary: `GET ${path} returned ${measured.responseBytes} bytes`,
            details: { path, ...measured },
          });
        }).pipe(
          catchError(() => of(undefined)),
          mergeMap(() => [value]),
        );
      }),
    );
  }
}
