# GF-EQUITY-001 manual oracle

This oracle was calculated independently from the application implementation.

- Closing contributed capital: `500,000,000 + 200,000,000 - 50,000,000 = 650,000,000`.
- Accumulated loss: `max(0, -(-700,000,000)) = 700,000,000`.
- Equity Consumed: `700,000,000 / 650,000,000 = 107.69%`. The `250,000,000` owner loan is a liability and is excluded.
- Average operating net cash flow: `(-120,000,000 - 80,000,000 - 100,000,000) / 3 = -100,000,000`.
- Net burn: `100,000,000`; runway: unrestricted cash `450,000,000 / 100,000,000 = 4.5 months`. Restricted cash is excluded.
- ROE denominator: average equity `(400,000,000 + 150,000,000) / 2 = 275,000,000`.
- ROA denominator: average assets `(1,200,000,000 + 1,000,000,000) / 2 = 1,100,000,000`.
- Project ROI and marketing ROI each use their own reviewed included-cost policy; they are never combined.
