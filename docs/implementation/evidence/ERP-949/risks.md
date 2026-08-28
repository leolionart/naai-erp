# Risks

- Requests without an organization path are intentionally not persisted because no organization scope can be established.
- If the database itself is unavailable, activity persistence is best-effort and the API response remains authoritative.
