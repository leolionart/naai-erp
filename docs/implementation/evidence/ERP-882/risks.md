# ERP-882 risks

- No currency conversion is inferred; every report series remains denominated in its source currency.
- Localhost currently proxies the production API, so live data remains unavailable on the new routes
  until ERP-882 is pushed, its images are published and production is updated. The UI reports this as
  an explicit API error rather than showing fabricated zeros.
