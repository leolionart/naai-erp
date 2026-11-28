import type { CliValues } from "./main-cli-options.js";
import {
  loadProfiles,
  profileStorePath,
  removeProfile,
  resolveProfile,
  saveProfiles,
  setProfile,
  useProfile,
} from "./profiles.js";

export async function runProfileCommand(
  action: string,
  profileName: string | undefined,
  values: CliValues,
): Promise<never> {
  // Remembered connection profiles: `profile list|show|set <name>|use <name>|remove <name>`.
  try {
    let store = await loadProfiles();
    const print = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
    if (action === "list") print({ path: profileStorePath(), ...store });
    else if (action === "show") print(resolveProfile(store, values.profile ?? profileName) ?? null);
    else if (["set", "use", "remove"].includes(action)) {
      if (!profileName) throw new Error(`profile ${action} requires a profile name`);
      store =
        action === "set"
          ? setProfile(
              store,
              profileName,
              {
                organization: values.organization ?? "",
                ...(values["base-url"] ? { baseUrl: values["base-url"] } : {}),
              },
              values.use,
            )
          : action === "use"
            ? useProfile(store, profileName)
            : removeProfile(store, profileName);
      await saveProfiles(store);
      print({ path: profileStorePath(), ...store });
    } else throw new Error(`Unsupported profile action: ${action}`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 2;
  }
  process.exit();
}

export async function resolveCliConnection(
  resource: string | undefined,
  action: string,
  values: CliValues,
) {
  // Resolution order: explicit flag, environment, then the remembered (active or --profile) profile.
  const rememberedProfile = resolveProfile(
    await loadProfiles(),
    values.profile ?? process.env.NAAI_ERP_PROFILE,
  );
  values["base-url"] ??=
    process.env.NAAI_ERP_BASE_URL ?? rememberedProfile?.profile.baseUrl ?? "http://localhost:3001";
  const organizationId =
    values.organization ??
    process.env.NAAI_ERP_ORGANIZATION ??
    rememberedProfile?.profile.organization;
  const token = process.env.NAAI_ERP_TOKEN;
  const discovery =
    resource === "discovery" && ["openapi", "capabilities", "describe"].includes(action);
  const crossEnvironmentClone = resource === "portable-data-clone" && action === "run";
  return {
    baseUrl: values["base-url"]!,
    organizationId,
    token,
    discovery,
    crossEnvironmentClone,
  };
}
