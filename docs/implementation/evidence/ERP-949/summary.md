# ERP-949 Request lifecycle logging

Implemented organization-scoped HTTP lifecycle activities. Requests create a `running` operational activity and finalize as `succeeded` or `failed`; authentication failures occurring in Fastify `onRequest` are also recorded with stage and structured error details. Logging failures never block the API response.
