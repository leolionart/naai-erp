# ERP-916 acceptance

- A valid sealed session with browser Origin `https://erp.naai.studio` is accepted when the internal
  request URL is `http://localhost` and proxy headers identify `https://erp.naai.studio`.
- Missing sessions remain rejected.
- An attacker Origin remains rejected.
- Malformed forwarded/origin values fail closed.
- API credentials are not printed or included in error responses.
