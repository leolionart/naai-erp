"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "./client";
import {
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  type ApiConnectionSettingsV1,
} from "./connection";

export function useAuthenticatedApiClient() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const configuredDataSource = process.env.NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE;
    const forceDefaultConnection =
      process.env.NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION === "1" ||
      configuredDataSource === "production" ||
      configuredDataSource === "local";
    setConnection(
      loadConnectionSettings(window.localStorage, DEFAULT_API_CONNECTION, forceDefaultConnection),
    );
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
