# ERP-918 — Mobile login persistence

Mobile/LAN HTTP sessions now receive a persistent cookie without the invalid `Secure` attribute,
while production and forwarded HTTPS remain secure. The login form exposes a remember-login choice
and standards-based password-manager fields without storing a raw password in browser storage.
