# ERP-918 risks

Rotating or losing `SESSION_SECRET` intentionally invalidates existing encrypted sessions. Production
deployment configuration must keep this secret stable across image updates.
