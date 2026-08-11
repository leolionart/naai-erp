# ERP-900 risks

- Dynamic `{action}` routes are intentionally classified conservatively; ERP-901 must resolve each
  concrete action before changing behavior.
- The matrix must be regenerated and reviewed whenever OpenAPI adds or removes a mutation.
- Maximum-severity classification is intentionally broader than every concrete action on a dynamic
  route; implementation tasks must narrow behavior by concrete action without weakening safeguards.
