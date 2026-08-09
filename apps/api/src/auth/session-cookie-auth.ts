import { openPersistentSession, sessionCookieFromHeader } from "@naai-erp/contracts/session-cookie";

export const COOKIE_SESSION_AUTHORIZATION = "Bearer cookie-session";

type SessionAuthEnvironment = Readonly<{
  SESSION_SECRET?: string;
  WEB_ORIGIN?: string;
  APP_BASE_URL?: string;
}>;

type SessionAuthRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
};

export class SessionAuthenticationError extends Error {
  constructor(
    readonly statusCode: 401 | 403,
    readonly code: "SESSION_UNAUTHORIZED" | "SESSION_ORGANIZATION_MISMATCH" | "ORIGIN_FORBIDDEN",
  ) {
    super(code);
  }
}

function header(request: SessionAuthRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestOrganization(url: string): string | undefined {
  const match = new URL(url, "http://api.local").pathname.match(
    /^\/api\/v1\/organizations\/([^/]+)(?:\/|$)/,
  );
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function configuredOrigin(environment: SessionAuthEnvironment): string | undefined {
  const configured = environment.WEB_ORIGIN?.trim() || environment.APP_BASE_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function authenticateApiSession(
  request: SessionAuthRequest,
  environment: SessionAuthEnvironment = process.env,
): void {
  const authorization = header(request, "authorization");
  if (authorization && authorization !== COOKIE_SESSION_AUTHORIZATION) return;

  const cookie = sessionCookieFromHeader(header(request, "cookie") ?? null);
  if (!cookie) return;

  const secret = environment.SESSION_SECRET?.trim();
  if (!secret) throw new SessionAuthenticationError(401, "SESSION_UNAUTHORIZED");

  let session;
  try {
    session = openPersistentSession(cookie, secret);
  } catch {
    throw new SessionAuthenticationError(401, "SESSION_UNAUTHORIZED");
  }

  const organizationId = requestOrganization(request.url);
  if (!organizationId || organizationId !== session.organizationId)
    throw new SessionAuthenticationError(403, "SESSION_ORGANIZATION_MISMATCH");

  if (isUnsafeMethod(request.method)) {
    const expectedOrigin = configuredOrigin(environment);
    if (!expectedOrigin || header(request, "origin") !== expectedOrigin)
      throw new SessionAuthenticationError(403, "ORIGIN_FORBIDDEN");
  }

  request.headers.authorization = `Bearer ${session.apiToken}`;
}
