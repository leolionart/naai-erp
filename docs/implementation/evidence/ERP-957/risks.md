# Risks and follow-ups

- Static SVG assets intentionally use a fixed indigo/lime palette for browser chrome. Inline app
  marks use theme tokens and accessible fallback colors so the logo remains high contrast in both
  light and dark themes.
- Raster exports (PNG/ICO) are not required by Next App Router and were not added; add them only if
  an external marketplace or native wrapper requires raster artwork.
