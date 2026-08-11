# ERP-891 Risks

- Switching profiles requires stopping the current web development process before starting the other
  profile because both use port 3000 and the same `.next` directory.
- Production-backed development depends on the existing macOS Keychain token and upstream availability.
- Production writes remain opt-in through the existing `--write` flag and should not be used for normal
  UI development.
