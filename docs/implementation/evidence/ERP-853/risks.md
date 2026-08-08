# ERP-853 risks

- Target memberships, users, and credentials must be provisioned before restore.
- Actor remapping is intentionally explicit and maps source actor identifiers to the authenticated target owner; original identifiers remain in restore audit metadata.
- Paperless remains the source-file owner, so evidence/binary payload tables are intentionally excluded from organization restore.
