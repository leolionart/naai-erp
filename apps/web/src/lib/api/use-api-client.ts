"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "./client";
import {
  DEFAULT_API_CONNECTION,
  LOCAL_DEVELOPMENT_TOKEN,
  loadApiToken,
  loadConnectionSettings,
  type ApiConnectionSettingsV1,
} from "./connection";

export function useAuthenticatedApiClient() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    const storedToken = loadApiToken(window.sessionStorage);
    setToken(storedToken);
    setHydrated(true);
  }, []);

  const client = useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
  return { client, connection, token, hydrated, hasToken: hydrated && Boolean(token) };
}
