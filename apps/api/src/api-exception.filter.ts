import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply } from "fastify";

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  "Idempotency key was reused with a different request": 409,
  "Resource version conflict": 409,
  IDEMPOTENCY_CONFLICT: 409,
  JOURNAL_ALREADY_POSTED: 409,
  INVALID_JOURNAL_STATE: 409,
  JOURNAL_UNBALANCED: 422,
  INVALID_POSTING_RULE: 422,
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const message = exception instanceof Error ? exception.message : "INTERNAL_ERROR";
    const status = STATUS_BY_CODE[message] ?? 400;
    response.status(status).send({
      apiVersion: "v1",
      error: {
        code: message.replaceAll(" ", "_").toUpperCase(),
        message,
        retryable: status >= 500,
      },
    });
  }
}
