# ERP-863 risks

- Retrying DELETE without a successful version readback could target stale resource versions.
- Restarting or changing production infrastructure was not authorized by this data-cleanup request.
- The twelve drafts remain recoverable and unchanged until production API service is restored.

