# ERP-916 summary

Fixed the production-only automation-token failure behind Caddy/Cloudflare. The route now validates
the browser Origin against both the internal request origin and the public origin reconstructed from
the first forwarded protocol/host values.
