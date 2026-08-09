# ERP-866 tests

- Before repair: web `SESSION_SECRET` absent; all four `NAAI_ERP_LOGIN_*` values present.
- After repair: web `SESSION_SECRET` present with length 96.
- Invalid-credential probe: HTTP 401 with `Tài khoản hoặc mật khẩu không đúng`, proving configured
  authentication replaced the prior HTTP 503 configuration error.
- Configured-credential probe inside the web container: login HTTP 200, secure cookie returned,
  session GET HTTP 200 for organization `naai`.
- Dockge readback: API, web, worker and PostgreSQL healthy.

