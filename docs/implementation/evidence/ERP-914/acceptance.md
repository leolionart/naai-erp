# ERP-914 acceptance

- The copied expression is a single `{{ { ... } }}`-compatible n8n expression object.
- Its output can be used directly as the JSON Body of the one-call purchase-invoice HTTP Request.
- It handles the exact Paperless/OCR structure illustrated by the user.
- It does not emit internal project, party, account, line or allocation identifiers.
- Category remains an OCR label/code for server-side canonical resolution.
