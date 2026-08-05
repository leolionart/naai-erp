# Secret Management Policy

- Never commit `.env`, private keys, service-account JSON, database dumps or real credentials.
- `.env.example` contains names and safe placeholders only.
- Development, CI, staging and production use separate credentials/keys.
- Production secrets are injected by the deployment host/secret store; they are not image layers or build arguments.
- Logs, audit payloads, test artifacts, SBOM and release manifests must not contain secret values.
- Rotate session, webhook, storage and database secrets after suspected exposure.
- Access follows least privilege and is reviewed when team membership changes.

