# Risks and follow-ups

- SVG assets intentionally use a fixed indigo/lime brand palette so browser chrome remains stable in
  both themes. The inline mark uses CSS variables with the same accessible fallback colors.
- Raster exports (PNG/ICO) are not required by Next App Router and were not added; add them only if
  an external marketplace or native wrapper requires raster artwork.
