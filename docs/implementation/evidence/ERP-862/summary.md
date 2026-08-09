# ERP-862 summary

Production login now stores the organization-scoped API credential only inside an encrypted 30-day
`HttpOnly` cookie. Web and API share a stable server-only `SESSION_SECRET`, so normal application
updates no longer force a new login. Browser API requests use the cookie while CLI Bearer auth is
unchanged.
