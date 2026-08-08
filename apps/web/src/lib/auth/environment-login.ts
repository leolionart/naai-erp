import { timingSafeEqual } from "node:crypto";

export type EnvironmentLoginConfig = Readonly<{
  username: string;
  password: string;
  organizationId: string;
  apiToken: string;
}>;

function requiredEnvironmentValue(name: string, value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${name} is not configured`);
  return normalized;
}

export function loadEnvironmentLoginConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EnvironmentLoginConfig {
  return Object.freeze({
    username: requiredEnvironmentValue(
      "NAAI_ERP_LOGIN_USERNAME",
      environment.NAAI_ERP_LOGIN_USERNAME,
    ),
    password: requiredEnvironmentValue(
      "NAAI_ERP_LOGIN_PASSWORD",
      environment.NAAI_ERP_LOGIN_PASSWORD,
    ),
    organizationId: requiredEnvironmentValue(
      "NAAI_ERP_LOGIN_ORGANIZATION",
      environment.NAAI_ERP_LOGIN_ORGANIZATION,
    ),
    apiToken: requiredEnvironmentValue(
      "NAAI_ERP_LOGIN_API_TOKEN",
      environment.NAAI_ERP_LOGIN_API_TOKEN,
    ),
  });
}

function constantTimeEqual(actual: string, expected: string) {
  const actualDigest = Buffer.from(actual);
  const expectedDigest = Buffer.from(expected);
  if (actualDigest.length !== expectedDigest.length) {
    timingSafeEqual(expectedDigest, expectedDigest);
    return false;
  }
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function authenticateEnvironmentLogin(
  credentials: Readonly<{ username: string; password: string }>,
  config: EnvironmentLoginConfig,
) {
  const usernameMatches = constantTimeEqual(credentials.username, config.username);
  const passwordMatches = constantTimeEqual(credentials.password, config.password);
  return usernameMatches && passwordMatches;
}
