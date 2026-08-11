export const API_CONNECTION_SETTINGS_KEY = "naai-erp-admin-settings-v2";
export const API_TOKEN_KEY = "naai-erp-admin-token";
export const COOKIE_SESSION_SENTINEL = "cookie-session";

export type ApiConnectionSettingsV1 = Readonly<{
  version: 1;
  baseUrl: string;
  organizationId: string;
}>;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function resolveDefaultApiBaseUrl(input: {
  nodeEnv: string | undefined;
  dataSource?: string;
  publicApiUrl?: string;
  serverApiUrl?: string;
  browserOrigin?: string;
}) {
  const dataSource = input.dataSource?.trim().toLowerCase();
  if (dataSource === "production") {
    return input.browserOrigin ? `${input.browserOrigin}/dev-api` : "/dev-api";
  }
  const configured = input.publicApiUrl?.trim();
  if (configured) return configured;
  if (input.nodeEnv === "production" && input.browserOrigin) return input.browserOrigin;
  const serverConfigured = input.serverApiUrl?.trim();
  if (serverConfigured) return serverConfigured;
  return "http://localhost:3001";
}

export const DEFAULT_API_CONNECTION: ApiConnectionSettingsV1 = Object.freeze({
  version: 1,
  baseUrl: resolveDefaultApiBaseUrl({
    nodeEnv: process.env.NODE_ENV,
    dataSource: process.env.NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE,
    publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
    serverApiUrl: process.env.API_BASE_URL,
    ...(typeof window !== "undefined" ? { browserOrigin: window.location.origin } : {}),
  }),
  organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? "naai",
});

export const LOCAL_DEVELOPMENT_TOKEN =
  process.env.NODE_ENV === "development"
    ? process.env.NEXT_PUBLIC_API_TOKEN?.trim() || "dev-token"
    : process.env.NEXT_PUBLIC_API_TOKEN?.trim() || "";

export function normalizeConnectionSettings(input: {
  baseUrl: string;
  organizationId: string;
}): ApiConnectionSettingsV1 {
  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
  const organizationId = input.organizationId.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new Error("API URL must use HTTP or HTTPS");
  if (!organizationId) throw new Error("Organization ID is required");
  return Object.freeze({ version: 1, baseUrl, organizationId });
}

export function parseConnectionSettings(raw: string | null): ApiConnectionSettingsV1 | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<ApiConnectionSettingsV1>;
    if (
      value.version !== 1 ||
      typeof value.baseUrl !== "string" ||
      typeof value.organizationId !== "string"
    ) {
      return undefined;
    }
    return normalizeConnectionSettings({
      baseUrl: value.baseUrl,
      organizationId: value.organizationId,
    });
  } catch {
    return undefined;
  }
}

export function loadConnectionSettings(
  storage: StorageLike,
  fallback: ApiConnectionSettingsV1 = DEFAULT_API_CONNECTION,
  forceFallback = false,
): ApiConnectionSettingsV1 {
  if (forceFallback) {
    storage.removeItem(API_CONNECTION_SETTINGS_KEY);
    return fallback;
  }
  const parsed = parseConnectionSettings(storage.getItem(API_CONNECTION_SETTINGS_KEY));
  if (parsed) return parsed;
  storage.removeItem(API_CONNECTION_SETTINGS_KEY);
  return fallback;
}

export function saveConnectionSettings(storage: StorageLike, settings: ApiConnectionSettingsV1) {
  const normalized = normalizeConnectionSettings(settings);
  storage.setItem(API_CONNECTION_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadApiToken(storage: StorageLike): string {
  const token = storage.getItem(API_TOKEN_KEY)?.trim() ?? "";
  if (!token) {
    if (process.env.NODE_ENV === "production") return COOKIE_SESSION_SENTINEL;
    return LOCAL_DEVELOPMENT_TOKEN;
  }
  return token;
}

export function saveApiToken(storage: StorageLike, token: string): string {
  const normalized = token.trim().replace(/^Bearer\s+/i, "");
  if (normalized) storage.setItem(API_TOKEN_KEY, normalized);
  else storage.removeItem(API_TOKEN_KEY);
  return normalized;
}

export function organizationApiRoot(settings: ApiConnectionSettingsV1): string {
  return `${settings.baseUrl}/api/v1/organizations/${encodeURIComponent(settings.organizationId)}`;
}
