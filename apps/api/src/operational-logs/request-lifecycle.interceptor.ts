import { Inject, Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { catchError, defer, mergeMap, of, throwError } from "rxjs";
import { randomUUID } from "node:crypto";
import { OPERATIONAL_LOG_STORE, type OperationalLogStore } from "./operational-log.types.js";

/** Records one lifecycle activity for organization-scoped HTTP requests. */
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
    if (!organizationId || !this.store.start || !this.store.finish) return next.handle();
    const id = randomUUID();
    const method = request.method ?? "REQUEST";
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
}
