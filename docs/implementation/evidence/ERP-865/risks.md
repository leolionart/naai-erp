# ERP-865 Risks

- Deployment credentials and API tokens must be provisioned outside the repository.
- Published GHCR packages may require registry authentication depending on package visibility.
- Reverse proxy and TLS configuration remain environment-specific and are intentionally delegated to the deployment operator.
