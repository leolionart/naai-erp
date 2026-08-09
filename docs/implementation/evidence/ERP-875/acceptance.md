# ERP-875 acceptance

- Image-building push detection is tied to `.github/workflows/release-main.yml` paths.
- Successful image publishing requires `gh release create` against the exact pushed SHA.
- Release naming, immutable image tag evidence and final handoff URLs are defined.
- Docs-only and no-image pushes do not create releases.
