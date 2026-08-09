# ERP-866 summary

Production login returned `Đăng nhập chưa được cấu hình` because the deployed stack compose file did
not pass `SESSION_SECRET` to the web container. The four configured `NAAI_ERP_LOGIN_*` values were
already present; API also had the session secret.

The production stack compose file was synchronized from the repository contract and the web service
was recreated. No login credential value was printed or changed.

