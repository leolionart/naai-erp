import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Remembered connection profiles so the organization (and API URL) need not be typed on every
 * command. Only non-secret values are stored; the API token always comes from NAAI_ERP_TOKEN.
 */
export type Profile = Readonly<{ organization: string; baseUrl?: string }>;
export type ProfileStore = Readonly<{
  version: 1;
  active?: string;
  profiles: Readonly<Record<string, Profile>>;
}>;

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function profileStorePath(environment: Record<string, string | undefined> = process.env) {
  return (
    environment.NAAI_ERP_CONFIG?.trim() || join(homedir(), ".config", "naai-erp", "profiles.json")
  );
}

export async function loadProfiles(path = profileStorePath()): Promise<ProfileStore> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<ProfileStore>;
    if (parsed.version !== 1 || typeof parsed.profiles !== "object" || !parsed.profiles)
      throw new Error("invalid");
    return {
      version: 1,
      ...(parsed.active ? { active: parsed.active } : {}),
      profiles: parsed.profiles,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, profiles: {} };
    throw new Error(`Profile file ${path} is unreadable or invalid`);
  }
}

export async function saveProfiles(store: ProfileStore, path = profileStorePath()) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function setProfile(
  store: ProfileStore,
  name: string,
  profile: Profile,
  makeActive: boolean,
): ProfileStore {
  if (!NAME.test(name))
    throw new Error("Profile name must be 1-64 letters, digits, '.', '_' or '-'");
  if (!profile.organization.trim()) throw new Error("profile set requires --organization");
  if (profile.baseUrl && !/^https?:\/\/[^\s]+$/i.test(profile.baseUrl))
    throw new Error("--base-url must use HTTP or HTTPS");
  const isFirst = Object.keys(store.profiles).length === 0;
  return {
    version: 1,
    ...(makeActive || isFirst || store.active
      ? { active: makeActive || isFirst ? name : store.active! }
      : {}),
    profiles: { ...store.profiles, [name]: profile },
  };
}

export function useProfile(store: ProfileStore, name: string): ProfileStore {
  if (!store.profiles[name]) throw new Error(`Unknown profile: ${name}`);
  return { ...store, active: name };
}

export function removeProfile(store: ProfileStore, name: string): ProfileStore {
  if (!store.profiles[name]) throw new Error(`Unknown profile: ${name}`);
  const rest = Object.fromEntries(Object.entries(store.profiles).filter(([key]) => key !== name));
  const active = store.active === name ? Object.keys(rest)[0] : store.active;
  return { version: 1, ...(active ? { active } : {}), profiles: rest };
}

/** Picks the explicit profile (flag/env) or the active one; an unknown explicit name is an error. */
export function resolveProfile(
  store: ProfileStore,
  requested: string | undefined,
): { name: string; profile: Profile } | undefined {
  const name = requested?.trim() || store.active;
  if (!name) return undefined;
  const profile = store.profiles[name];
  if (!profile) {
    if (requested) throw new Error(`Unknown profile: ${name}`);
    return undefined;
  }
  return { name, profile };
}
