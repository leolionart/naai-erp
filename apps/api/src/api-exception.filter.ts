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
  JOURNAL_NOT_APPROVED: 409,
  MAKER_CHECKER_VIOLATION: 409,
  JOURNAL_ALREADY_REVERSED: 409,
  INVALID_PERIOD_TRANSITION: 409,
  FISCAL_PERIOD_NOT_FOUND: 422,
  FISCAL_PERIOD_AMBIGUOUS: 422,
  PERIOD_SOFT_LOCKED: 409,
  PERIOD_HARD_LOCKED: 409,
  OPENING_BALANCE_CONTROL_TOTAL_MISMATCH: 422,
  OPENING_BALANCE_SUBLEDGER_DETAIL_REQUIRED: 422,
  OPENING_BALANCE_ACCOUNT_INVALID: 422,
  DOCUMENT_ALLOCATION_INVALID: 422,
  DOCUMENT_ALLOCATION_MISMATCH: 422,
  DOCUMENT_CONTROL_TOTAL_MISMATCH: 422,
  INVALID_DOCUMENT_TRANSITION: 409,
  CREDIT_ORIGINAL_INVALID: 422,
  CREDIT_ORIGINAL_MISMATCH: 422,
  CREDIT_EXCEEDS_REMAINING: 409,
  CREDIT_ORIGINAL_LINE_REQUIRED: 422,
  CREDIT_ORIGINAL_LINE_INVALID: 422,
  PURCHASE_TAX_REVIEW_REQUIRED: 422,
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
