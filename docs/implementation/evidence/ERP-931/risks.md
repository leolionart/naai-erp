# ERP-931 risks

- The directory currently requests up to 100 related parties/projects, matching the existing list
  limit. Counts and name joins beyond that page need a future aggregate/paginated API if the master
  data grows past 100 records.
- In-app Browser screenshot evidence was unavailable; repository Playwright passed on desktop and
  390px mobile Chromium.
- Progress values are capped visually at 100%; the exact amounts remain visible when scope or billing
  exceeds the original commitment.
