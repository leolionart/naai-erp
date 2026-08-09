# ERP-875 risks

- Release creation requires an authenticated GitHub CLI identity with repository write access.
- A failed or cancelled image workflow blocks release creation; agents must report the workflow
  result instead of publishing misleading release notes.
