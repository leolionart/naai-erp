# Risks

- Other configuration/report tables retain their domain-specific ordering; this change covers business records and activity logs.
- Newly arriving logs are picked up by explicit refresh, avoiding disruptive list replacement while reading history.
