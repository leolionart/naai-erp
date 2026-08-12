# ERP-916 risks

- The deployment boundary must continue to overwrite `X-Forwarded-Proto` and `X-Forwarded-Host`;
  browsers cannot set these headers themselves. Caddy currently provides this boundary.
- Existing invalid cookies may still require one fresh login, but newly issued production sessions
  no longer fail solely because Next.js sees the container origin.
