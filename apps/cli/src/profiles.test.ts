import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadProfiles,
  removeProfile,
  resolveProfile,
  saveProfiles,
  setProfile,
  useProfile,
} from "./profiles.js";

const empty = { version: 1 as const, profiles: {} };

describe("CLI profiles", () => {
  it("activates the first profile and keeps later ones inactive until used", () => {
    const one = setProfile(empty, "naai", { organization: "naai" }, false);
    expect(one.active).toBe("naai");
    const two = setProfile(
      one,
      "other",
      { organization: "other-co", baseUrl: "https://b.example" },
      false,
    );
    expect(two.active).toBe("naai");
    expect(useProfile(two, "other").active).toBe("other");
    expect(resolveProfile(two, undefined)?.profile.organization).toBe("naai");
    expect(resolveProfile(two, "other")?.profile.baseUrl).toBe("https://b.example");
  });

  it("validates names, organization, URL and unknown profiles", () => {
    expect(() => setProfile(empty, "bad name", { organization: "x" }, false)).toThrow();
    expect(() => setProfile(empty, "ok", { organization: " " }, false)).toThrow();
    expect(() =>
      setProfile(empty, "ok", { organization: "x", baseUrl: "ftp://x" }, false),
    ).toThrow();
    expect(() => useProfile(empty, "missing")).toThrow("Unknown profile");
    expect(() => resolveProfile(empty, "missing")).toThrow("Unknown profile");
    expect(resolveProfile(empty, undefined)).toBeUndefined();
  });

  it("moves the active profile when the active one is removed", () => {
    let store = setProfile(empty, "a", { organization: "a" }, false);
    store = setProfile(store, "b", { organization: "b" }, false);
    expect(removeProfile(store, "a")).toMatchObject({ active: "b" });
    expect(removeProfile(removeProfile(store, "a"), "b").active).toBeUndefined();
  });

  it("persists with owner-only permissions and never stores a token", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "naai-profiles-")), "nested", "profiles.json");
    expect(await loadProfiles(path)).toEqual(empty);
    await saveProfiles(setProfile(empty, "naai", { organization: "naai" }, true), path);
    expect(((await stat(path)).mode & 0o777).toString(8)).toBe("600");
    expect(await readFile(path, "utf8")).not.toMatch(/token/i);
    expect((await loadProfiles(path)).profiles.naai?.organization).toBe("naai");
  });
});
