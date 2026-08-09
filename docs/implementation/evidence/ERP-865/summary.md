# ERP-865 Summary

Rewrote the project README in Vietnamese to position NAAI ERP as an AI-native ERP for a one-person business. The README now inventories the implemented management domains, explains the shared web/API/CLI/AI service boundary, uses expandable sections, and provides release-image and local-build Docker Compose deployment instructions.

Follow-up clarification: production deployment does not require cloning the repository. The README now shows how to create a standalone deployment directory, download only `compose.yaml` and the environment template at a pinned release ref, validate the resolved images, and distinguishes this workflow from source builds.

Files changed:

- `README.md`
- `docs/implementation/task-ledger.yaml`
- `docs/implementation/evidence/ERP-865/`
