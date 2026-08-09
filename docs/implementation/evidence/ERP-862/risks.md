# ERP-862 risks

- Rotating `SESSION_SECRET` intentionally signs out every active browser session. Routine deploys
  must reuse the existing secret.
- The session lifetime is 30 days and currently has no rolling renewal; users sign in again after
  expiry or explicit logout.
- Cookie authentication requires the production web and API to remain on the same canonical HTTPS
  origin, matching the existing routing contract.
