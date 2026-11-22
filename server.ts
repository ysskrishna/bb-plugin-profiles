import {
  experimental_PluginRpcRefusal,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import {
  CUSTOM_MODELS_CHANGED,
  PROFILES_CHANGED,
  rpcContract,
} from "./contract";
import {
  CustomModelError,
  createCustomModels,
  type CustomModelsResult,
} from "./custom-models";
import {
  createProfile,
  deleteProfile,
  getProviderRule,
  INITIAL_SNAPSHOT,
  ProfileError,
  renameProfile,
  setDefaultModel,
  setHiddenModels,
  setProfileProjects,
  setProvider,
  type Snapshot,
} from "./profiles";
import { PROFILE_MIGRATIONS, ProfilesStore } from "./profiles-store";

export { rpcContract } from "./contract";

export function format(snapshot: Snapshot): string {
  const lines = [
    `Revision ${snapshot.revision}`,
    `Hidden models: ${snapshot.hiddenModels === "more" ? "shown under More models" : "removed from the picker"}`,
  ];
  for (const profile of snapshot.profiles) {
    lines.push("", `${profile.name} (${profile.id})`);
    lines.push(
      `  Projects: ${profile.projectIds.length ? profile.projectIds.join(", ") : profile.id === "default" ? "all other projects" : "none"}`,
    );
    const dm = profile.defaultModel;
    lines.push(
      `  Default model: ${dm ? `${dm.providerId}/${dm.model}${dm.reasoningLevel ? ` (${dm.reasoningLevel})` : ""}` : "none"}`,
    );
    const providers = Object.keys(profile.providers);
    if (providers.length === 0) lines.push("  Providers: all on, no limits");
    for (const id of providers) {
      const rule = getProviderRule(profile, id)!;
      lines.push(
        `  ${id}: ${rule.enabled ? "on" : "off"}${rule.limit ? `, limited to ${rule.modelIds.length} models` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, PROFILE_MIGRATIONS);
  const store = new ProfilesStore(db);

  function commit(change: (current: Snapshot) => Snapshot): Snapshot {
    let result: Snapshot;
    try {
      result = store.mutate(change);
    } catch (error) {
      if (error instanceof ProfileError)
        throw new experimental_PluginRpcRefusal({
          code: "invalid",
          message: error.message,
        });
      throw error;
    }
    bb.realtime.publish(PROFILES_CHANGED, { revision: result.revision });
    return result;
  }

  const customModels = createCustomModels({
    dataDir: () => bb.server.experimental_dataDir,
    hasNativeModel: async (providerId, model) => {
      const options = await bb.sdk.system.executionOptions({ providerId });
      return [...options.models, ...options.selectedOnlyModels].some(
        (m) => m.model === model,
      );
    },
    reload: () => bb.sdk.system.reloadConfig(),
  });

  async function changeCustomModels(
    change: () => Promise<CustomModelsResult>,
  ): Promise<CustomModelsResult> {
    let result: CustomModelsResult;
    try {
      result = await change();
    } catch (error) {
      if (error instanceof CustomModelError)
        throw new experimental_PluginRpcRefusal({
          code: "invalid",
          message: error.message,
        });
      throw error;
    }
    bb.realtime.publish(CUSTOM_MODELS_CHANGED, {});
    return result;
  }

  bb.rpc.register(rpcContract, {
    getSnapshot: () => store.read(),
    setHiddenModels: ({ mode }) => commit((s) => setHiddenModels(s, mode)),
    createProfile: ({ name, copyFromId }) => {
      const id = `p_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
      const snapshot = commit(
        (s) => createProfile(s, name, copyFromId, id).snapshot,
      );
      return { snapshot, id };
    },
    renameProfile: ({ id, name }) => commit((s) => renameProfile(s, id, name)),
    deleteProfile: ({ id }) => commit((s) => deleteProfile(s, id)),
    setProfileProjects: ({ id, projectIds }) =>
      commit((s) => setProfileProjects(s, id, projectIds)),
    setProvider: ({ profileId, providerId, rule }) =>
      commit((s) => setProvider(s, profileId, providerId, rule)),
    setDefaultModel: ({ profileId, defaultModel }) =>
      commit((s) => setDefaultModel(s, profileId, defaultModel)),
    reset: () => commit(() => INITIAL_SNAPSHOT),
    listCustomModels: async () => {
      try {
        return { models: await customModels.list() };
      } catch (error) {
        if (error instanceof CustomModelError)
          throw new experimental_PluginRpcRefusal({
            code: "invalid",
            message: error.message,
          });
        throw error;
      }
    },
    addCustomModel: (input) =>
      changeCustomModels(() => customModels.add(input)),
    removeCustomModel: (input) =>
      changeCustomModels(() => customModels.remove(input)),
  });

  const usage =
    "Usage: bb profiles status [--json] | reset [--json] | models list [--json] | models add <provider> <model> [display name...] [--json] | models remove <provider> <model> [--json]";
  bb.cli.register({
    name: "profiles",
    summary: "Inspect and reset per-project model profiles",
    commands: [
      {
        name: "status",
        summary: "Show profiles, their projects, provider rules and defaults",
        usage: "bb profiles status [--json]",
      },
      {
        name: "reset",
        summary: "Remove every profile and rule",
        usage: "bb profiles reset [--json]",
      },
      {
        name: "models",
        summary: "List, add or remove custom model IDs",
        usage:
          "bb profiles models list [--json] | add <provider> <model> [display name...] | remove <provider> <model>",
      },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const [command, ...args] = argv.filter((arg) => arg !== "--json");
      if (command === undefined || command === "help" || command === "--help")
        return { exitCode: 0, stdout: usage };
      try {
        if (command === "models") {
          const [action, providerId, model, ...name] = args;
          let result: CustomModelsResult;
          if (action === "list" && !providerId)
            result = { models: await customModels.list() };
          else if (action === "add" && providerId && model)
            result = await changeCustomModels(() =>
              customModels.add({
                providerId,
                model,
                displayName: name.join(" ").trim() || undefined,
              }),
            );
          else if (action === "remove" && providerId && model && !name.length)
            result = await changeCustomModels(() =>
              customModels.remove({ providerId, model }),
            );
          else return { exitCode: 1, stderr: usage };
          const lines = result.models.map(
            (m) =>
              `${m.providerId}/${m.model}${m.displayName ? ` (${m.displayName})` : ""}`,
          );
          return {
            exitCode: 0,
            stdout: json
              ? JSON.stringify(result)
              : [
                  ...(lines.length ? lines : ["No custom models"]),
                  ...(result.warning ? [result.warning] : []),
                ].join("\n"),
          };
        }
        let snapshot: Snapshot;
        if (command === "status" && args.length === 0) snapshot = store.read();
        else if (command === "reset" && args.length === 0)
          snapshot = commit(() => INITIAL_SNAPSHOT);
        else return { exitCode: 1, stderr: usage };
        return {
          exitCode: 0,
          stdout: json ? JSON.stringify(snapshot) : format(snapshot),
        };
      } catch (error) {
        return {
          exitCode: 1,
          stderr:
            error instanceof Error
              ? error.message.slice(0, 2048)
              : "Cannot update profiles",
        };
      }
    },
  });
}
