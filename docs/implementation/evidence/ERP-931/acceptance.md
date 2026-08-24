# ERP-931 acceptance

- PASS: cards derive only canonical master-data fields and explicit missing-value labels.
- PASS: customer cards expose tax/contact/project-count context.
- PASS: project cards expose customer/service/period/budget context.
- PASS: project cards expose invoiced and collected progress as separate percentages against the
  contract commitment.
- PASS: collected project revenue includes both receipt paths and excludes VAT through gross-to-net
  attribution, covered by PostgreSQL integration regression.
- PASS: status-left/action-right footer is shared between customer and project cards.
- PASS: desktop and 390px mobile Playwright E2E verifies visible values, progress, actions and no
  horizontal overflow.
