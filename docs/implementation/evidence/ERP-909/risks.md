# ERP-909 risks

- Example relationship IDs are placeholders by design. Automation clients must resolve and retain
  canonical IDs through REST/CLI reads and must not infer IDs from display names.
- Project `owner_user_id` requires a verified organization member ID; no public membership lookup is
  invented by this task.
- Tokens are shown only on explicit request, but operators remain responsible for storing them in an
  n8n credential rather than workflow JSON, logs or source code.
- Production deployment still requires image publication and stack readback after the commit is
  pushed; a Git push alone is not deployment proof.
