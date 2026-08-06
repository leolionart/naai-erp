/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports, @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAction,
  getConfig,
  loadEnv,
  runSetup,
  runStatus,
  validateIdentifier,
  redact,
} from "../scripts/native-dev-db.mjs";
import { createHash } from "node:crypto";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: any) => {
      const pathStr = typeof path === "string" ? path : path?.pathname || "";
      if (pathStr.includes(".env")) return true;
      if (pathStr.includes("postgresql@16")) return true;
      return actual.existsSync(path);
    },
    readFileSync: (path: any, options: any) => {
      const pathStr = typeof path === "string" ? path : path?.pathname || "";
      if (pathStr.includes(".env")) {
        return "NAAI_ERP_TOKEN=test-token-from-env-file\nNAAI_DB_ROLE=configured-role";
      }
      return actual.readFileSync(path, options);
    },
    readdirSync: (path: any, options: any) => {
      const pathStr = typeof path === "string" ? path : path?.pathname || "";
      if (pathStr.includes("migrations")) {
        return ["0001_init.sql", "0002_add_table.sql"] as any;
      }
      return actual.readdirSync(path, options);
    },
  };
});

describe("native-dev-db.mjs script tests", () => {
  let mockExecFile: any;
  let mockPool: any;
  let mockClient: any;
  let mockPg: any;
  let mockSeedTt133Mvp: any;
  let mockPoolClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPoolClient = {
      release: vi.fn(),
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    };

    mockExecFile = vi.fn().mockImplementation((file, args, options) => {
      const fullCmd = [file, ...(args || [])].join(" ");
      const input = options?.input || "";

      if (fullCmd.includes("which pg_config")) {
        return "/opt/homebrew/bin/pg_config";
      }
      if (file.includes("pg_config") && args?.includes("--version")) {
        return "pg_config (PostgreSQL) 16.3";
      }
      if (file.includes("pg_isready")) {
        return "accepting connections";
      }
      if (file.includes("psql")) {
        for (const arg of args || []) {
          if (arg.startsWith("-") && arg.includes("c") && arg !== "-c") {
            throw new Error("psql: option requires an argument -- c");
          }
        }
        const cIndex = args ? args.indexOf("-c") : -1;
        if (cIndex !== -1) {
          const query = args[cIndex + 1];
          if (!query || query.startsWith("-")) {
            throw new Error("psql: option requires an argument -- c");
          }
          if (query.includes("SELECT 1 FROM pg_roles")) {
            return "1";
          }
          if (query.includes("SELECT 1 FROM pg_database")) {
            return "1";
          }
          return "";
        }
        if (
          input.includes("SELECT 1 FROM pg_roles") ||
          input.includes("SELECT 1 FROM pg_database")
        ) {
          throw new Error("psql: SELECT checks must use -c, not stdin");
        }
        if (
          input.includes("CREATE ROLE") ||
          input.includes("ALTER ROLE") ||
          input.includes("CREATE DATABASE")
        ) {
          return "";
        }
      }
      return "";
    });

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockPoolClient),
      query: vi.fn().mockImplementation(async (queryStr, params) => {
        if (queryStr.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (queryStr.includes("drizzle.__drizzle_migrations")) {
          return { rowCount: 1, rows: [{ count: "2" }] };
        }
        if (queryStr.includes("api_credentials")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        return { rowCount: 0, rows: [] };
      }),
      end: vi.fn().mockResolvedValue(undefined),
    };

    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation(async (queryStr, params) => {
        if (queryStr.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (queryStr.includes("FROM users")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (queryStr.includes("FROM organization_memberships")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (queryStr.includes("FROM membership_roles")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (queryStr.includes("SELECT token_hash FROM api_credentials")) {
          return { rowCount: 1, rows: [{ token_hash: "hash" }] };
        }
        return { rowCount: 0, rows: [] };
      }),
      end: vi.fn().mockResolvedValue(undefined),
    };

    mockPg = {
      Pool: vi.fn().mockImplementation(function () {
        return mockPool;
      }),
      Client: vi.fn().mockImplementation(function () {
        return mockClient;
      }),
    };

    mockSeedTt133Mvp = vi.fn().mockResolvedValue(undefined);
  });

  describe("getAction", () => {
    it("should return status when argv has status", () => {
      expect(getAction(["node", "script", "status"])).toBe("status");
    });

    it("should return setup when argv has setup", () => {
      expect(getAction(["node", "script", "setup"])).toBe("setup");
    });

    it("should default to setup when argv has no action", () => {
      expect(getAction(["node", "script"])).toBe("setup");
    });
  });

  describe("getConfig", () => {
    it("should return default values when env is empty", () => {
      const config = getConfig({});
      expect(config.dbRole).toBe("naai_erp");
      expect(config.dbPassword).toBe("naai_erp");
      expect(config.dbName).toBe("naai_erp");
      expect(config.orgId).toBe("naai");
      expect(config.credentialId).toBe("local-owner-cred-id");
      expect(config.actorId).toBe("local-owner-actor");
      expect(config.token).toBeUndefined();
    });

    it("should return custom values when env is populated", () => {
      const env = {
        NAAI_DB_ROLE: "custom_role",
        NAAI_DB_PASSWORD: "custom_password",
        NAAI_DB_NAME: "custom_name",
        NAAI_ORG_ID: "custom-org",
        NAAI_CREDENTIAL_ID: "custom-cred",
        NAAI_ACTOR_ID: "custom-actor",
        NAAI_ERP_TOKEN: "custom-token",
      };
      const config = getConfig(env);
      expect(config.dbRole).toBe("custom_role");
      expect(config.dbPassword).toBe("custom_password");
      expect(config.dbName).toBe("custom_name");
      expect(config.orgId).toBe("custom-org");
      expect(config.credentialId).toBe("custom-cred");
      expect(config.actorId).toBe("custom-actor");
      expect(config.token).toBe("custom-token");
    });
  });

  describe("loadEnv", () => {
    it("should load environment variables from file if not already set", () => {
      const target: Record<string, string> = { EXISTING: "value" };
      loadEnv("dummy-path.env", target);
      expect(target.EXISTING).toBe("value");
      expect(target.NAAI_ERP_TOKEN).toBe("test-token-from-env-file");
      expect(target.NAAI_DB_ROLE).toBe("configured-role");
    });

    it("should not overwrite existing environment variables", () => {
      const target: Record<string, string> = { NAAI_DB_ROLE: "pre-set-role" };
      loadEnv("dummy-path.env", target);
      expect(target.NAAI_DB_ROLE).toBe("pre-set-role");
      expect(target.NAAI_ERP_TOKEN).toBe("test-token-from-env-file");
    });
  });

  describe("validateIdentifier", () => {
    it("should allow valid unquoted PostgreSQL identifiers", () => {
      expect(validateIdentifier("naai_erp")).toBe(true);
      expect(validateIdentifier("db_123")).toBe(true);
      expect(validateIdentifier("_private_role")).toBe(true);
    });

    it("should reject identifiers starting with numbers", () => {
      expect(validateIdentifier("1db")).toBe(false);
      expect(validateIdentifier("2026_db")).toBe(false);
    });

    it("should reject identifiers with quotes, semicolon, hyphens, and other special characters", () => {
      expect(validateIdentifier("naai-erp")).toBe(false);
      expect(validateIdentifier("role;")).toBe(false);
      expect(validateIdentifier("role; DROP TABLE accounts;")).toBe(false);
      expect(validateIdentifier("'role'")).toBe(false);
      expect(validateIdentifier('"role"')).toBe(false);
      expect(validateIdentifier("role\\")).toBe(false);
      expect(validateIdentifier("")).toBe(false);
    });
  });

  describe("redact", () => {
    it("should redact connection strings", () => {
      const connectionString = "postgresql://my_user:secret_pass@localhost:5432/my_db";
      expect(redact(connectionString)).toBe("postgresql://my_user:[REDACTED]@localhost:5432/my_db");
    });

    it("should redact exact passwords and tokens", () => {
      const config = { dbPassword: "password123!", token: "mySecretToken$$" };
      const rawText = "Password was password123! and token was mySecretToken$$";
      expect(redact(rawText, config)).toBe("Password was [REDACTED] and token was [REDACTED]");
    });

    it("should redact URL-encoded credentials in errors", () => {
      const config = { dbPassword: "pass word!", token: "tok/en" };
      const rawText = `Failed to connect with pass%20word! and tok%2Fen`;
      expect(redact(rawText, config)).toBe("Failed to connect with [REDACTED] and [REDACTED]");
    });
  });

  describe("runSetup", () => {
    it("should complete successfully if all conditions and token are provided", async () => {
      const result = await runSetup(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
      expect(mockSeedTt133Mvp).toHaveBeenCalledTimes(2);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO api_credentials"),
        expect.any(Array),
      );

      // Verify the actor user query was called
      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO users"),
        expect.arrayContaining([
          "local-owner-actor",
          "local-owner-actor@example.com",
          "Local Owner",
        ]),
      );

      // Verify organization memberships insert was called
      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO organization_memberships"),
        expect.arrayContaining(["naai", "local-owner-actor"]),
      );

      // Verify membership roles insert was called
      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO membership_roles"),
        expect.arrayContaining(["naai", "local-owner-actor"]),
      );
    });

    it("should preflight check: fail setup if token is missing and credential does not exist", async () => {
      mockPool.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        // Credential does not exist
        return { rowCount: 0, rows: [] };
      });

      const setupResult = await runSetup(
        {},
        { execFile: mockExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(setupResult.success).toBe(false);
      expect(setupResult.error).toBe("Missing NAAI_ERP_TOKEN");

      // Verify migration & seed were NOT run since preflight failed
      expect(mockSeedTt133Mvp).not.toHaveBeenCalled();
      const pnpmMigrationCalled = mockExecFile.mock.calls.some(
        (call: any) => call[1] && call[1].includes("db:migrate"),
      );
      expect(pnpmMigrationCalled).toBe(false);
    });

    it("should fail setup if dbRole or dbName contains adversarial characters", async () => {
      const setupResult1 = await runSetup(
        { NAAI_DB_ROLE: "role; DROP TABLE accounts;" },
        { execFile: mockExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(setupResult1.success).toBe(false);
      expect(setupResult1.error).toContain("Invalid database role identifier");

      const setupResult2 = await runSetup(
        { NAAI_DB_NAME: "db; SELECT 1;" },
        { execFile: mockExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(setupResult2.success).toBe(false);
      expect(setupResult2.error).toContain("Invalid database name identifier");
    });

    it("should redact exact passwords and tokens when role-creation or credential setup fails", async () => {
      const errorMsg =
        "psql failed: could not create role for password_super_secret and token_super_secret";
      const failingExecFile = vi.fn().mockImplementation((file, args, options) => {
        if (file.includes("psql")) {
          throw new Error(errorMsg);
        }
        return mockExecFile(file, args, options);
      });

      const result = await runSetup(
        {
          NAAI_ERP_TOKEN: "token_super_secret",
          NAAI_DB_PASSWORD: "password_super_secret",
        },
        { execFile: failingExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );

      expect(result.success).toBe(false);
      expect(result.error).not.toContain("password_super_secret");
      expect(result.error).not.toContain("token_super_secret");
      expect(result.error).toContain("[REDACTED]");
    });
  });

  describe("runStatus", () => {
    it("should fail when PostgreSQL is offline", async () => {
      // Stub checkPostgres to return offline
      const offlineExecFile = vi.fn().mockImplementation((file, args) => {
        if (file.includes("pg_isready")) {
          throw new Error("offline");
        }
        return mockExecFile(file, args);
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: offlineExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("PostgreSQL is offline");
    });

    it("should fail when the database role does not exist", async () => {
      const missingRoleExecFile = vi.fn().mockImplementation((file, args, options) => {
        const query = args && args.indexOf("-c") !== -1 ? args[args.indexOf("-c") + 1] : "";
        if (file.includes("psql") && query.includes("SELECT 1 FROM pg_roles")) {
          return "0"; // Role doesn't exist
        }
        return mockExecFile(file, args, options);
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: missingRoleExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should fail when the database does not exist", async () => {
      const missingDbExecFile = vi.fn().mockImplementation((file, args, options) => {
        const query = args && args.indexOf("-c") !== -1 ? args[args.indexOf("-c") + 1] : "";
        if (file.includes("psql") && query.includes("SELECT 1 FROM pg_database")) {
          return "0"; // DB doesn't exist
        }
        return mockExecFile(file, args, options);
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: missingDbExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should fail when the database connection fails", async () => {
      mockPool.query = vi.fn().mockRejectedValue(new Error("Connection timeout"));

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Database connection failed");
    });

    it("should fail when there is a migration mismatch", async () => {
      // DB has 1 migration applied, but disk has 2
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ count: "1" }],
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Migration count mismatch");
    });

    it("should fail when the owner credential is not found", async () => {
      mockClient.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (
          queryStr.includes("FROM users") ||
          queryStr.includes("FROM organization_memberships") ||
          queryStr.includes("FROM membership_roles")
        ) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        return { rowCount: 0, rows: [] }; // No credential found
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Owner API credential not found");
    });

    it("should fail when the token in env does not match the database credential hash", async () => {
      mockClient.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (
          queryStr.includes("FROM users") ||
          queryStr.includes("FROM organization_memberships") ||
          queryStr.includes("FROM membership_roles")
        ) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        return { rowCount: 1, rows: [{ token_hash: "mismatched-hash" }] };
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Credential token mismatch");
    });

    it("should fail when the actor user does not exist", async () => {
      mockClient.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("FROM users")) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ exists: true }] };
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Actor user or membership setup is incomplete");
    });

    it("should fail when the organization membership does not exist", async () => {
      mockClient.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("FROM organization_memberships")) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ exists: true }] };
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Actor user or membership setup is incomplete");
    });

    it("should fail when the owner role is not granted", async () => {
      mockClient.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("FROM membership_roles")) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ exists: true }] };
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Actor user or membership setup is incomplete");
    });

    it("should succeed and remain read-only when all checks pass", async () => {
      const hashed = createHash("sha256").update("my-token").digest("hex");
      mockClient.query = vi.fn().mockImplementation(async (queryStr) => {
        if (queryStr.includes("information_schema.tables")) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        if (
          queryStr.includes("FROM users") ||
          queryStr.includes("FROM organization_memberships") ||
          queryStr.includes("FROM membership_roles")
        ) {
          return { rowCount: 1, rows: [{ exists: true }] };
        }
        return { rowCount: 1, rows: [{ token_hash: hashed }] };
      });

      const result = await runStatus(
        { NAAI_ERP_TOKEN: "my-token" },
        { execFile: mockExecFile, pg: mockPg },
      );
      expect(result.success).toBe(true);

      // Verify no INSERT/UPDATE/DELETE/CREATE was called
      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringMatching(/(INSERT|UPDATE|DELETE|CREATE)/i),
      );
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringMatching(/(INSERT|UPDATE|DELETE|CREATE)/i),
      );
    });
  });

  describe("Adversarial tests", () => {
    it("should validate that dbRole and dbName strictly reject quotes/semicolon/backslashes", async () => {
      const badRoleResult = await runSetup(
        { NAAI_DB_ROLE: "user; DROP DATABASE naai_erp;" },
        { execFile: mockExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(badRoleResult.success).toBe(false);
      expect(badRoleResult.error).toContain("Invalid database role identifier");

      const badNameResult = await runSetup(
        { NAAI_DB_NAME: "db'; SELECT 1;" },
        { execFile: mockExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(badNameResult.success).toBe(false);
      expect(badNameResult.error).toContain("Invalid database name identifier");
    });

    it("should safely escape and encode a password with special characters, quotes, and semicolons", async () => {
      const trickyPassword = "password'; DROP TABLE accounts; -- \\\"";

      const customExecFile = vi.fn().mockImplementation((file, args, options) => {
        const query = args && args.indexOf("-c") !== -1 ? args[args.indexOf("-c") + 1] : "";
        if (file.includes("psql") && query.includes("SELECT 1 FROM pg_roles")) {
          return "0"; // Role does not exist
        }
        return mockExecFile(file, args, options);
      });

      const result = await runSetup(
        {
          NAAI_ERP_TOKEN: "token",
          NAAI_DB_PASSWORD: trickyPassword,
        },
        { execFile: customExecFile, pg: mockPg, seedTt133Mvp: mockSeedTt133Mvp },
      );
      expect(result.success).toBe(true);

      // Verify that psql received the escaped password through standard input
      const psqlInputCalls = customExecFile.mock.calls
        .filter((call: any) => call[0].includes("psql") && call[2]?.input)
        .map((call: any) => call[2].input);

      expect(
        psqlInputCalls.some((input: string) =>
          input.includes("password''; DROP TABLE accounts; -- \\\""),
        ),
      ).toBe(true);

      // Check pool instantiation with URL-encoded password
      expect(mockPg.Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: expect.stringContaining(encodeURIComponent(trickyPassword)),
        }),
      );
    });

    it("should fail when psql is called with a missing or incorrect -c argument", async () => {
      expect(() =>
        mockExecFile("psql", ["-d", "postgres", "-tAc"], { input: "SELECT 1;" }),
      ).toThrow("psql: option requires an argument -- c");
      expect(() =>
        mockExecFile("psql", ["-d", "postgres", "-tA", "-c"], { stdio: "pipe" }),
      ).toThrow("psql: option requires an argument -- c");
      expect(() =>
        mockExecFile("psql", ["-d", "postgres", "-tA", "-c", "-f"], { stdio: "pipe" }),
      ).toThrow("psql: option requires an argument -- c");
    });
  });
});
