import { describe, expect, it } from "vitest";
import { authenticateEnvironmentLogin, loadEnvironmentLoginConfig } from "./environment-login";

const config = {
  username: "owner",
  password: "correct horse battery staple",
  organizationId: "naai",
  apiToken: "owner-api-token",
};

describe("environment login", () => {
  it("accepts only the configured username and password", () => {
    expect(
      authenticateEnvironmentLogin({ username: "owner", password: config.password }, config),
    ).toBe(true);
    expect(
      authenticateEnvironmentLogin({ username: "other", password: config.password }, config),
    ).toBe(false);
    expect(authenticateEnvironmentLogin({ username: "owner", password: "wrong" }, config)).toBe(
      false,
    );
  });

  it("requires every server-only login setting", () => {
    expect(() => loadEnvironmentLoginConfig({})).toThrow("NAAI_ERP_LOGIN_USERNAME");
    expect(
      loadEnvironmentLoginConfig({
        NAAI_ERP_LOGIN_USERNAME: " owner ",
        NAAI_ERP_LOGIN_PASSWORD: " secret ",
        NAAI_ERP_LOGIN_ORGANIZATION: " naai ",
        NAAI_ERP_LOGIN_API_TOKEN: " token ",
      }),
    ).toEqual({
      username: "owner",
      password: "secret",
      organizationId: "naai",
      apiToken: "token",
    });
  });
});
