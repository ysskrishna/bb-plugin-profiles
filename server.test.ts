import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
async function setup() {
  const host = createFakePluginHost({ pluginId: "profiles" });
  hosts.push(host);
  await plugin(host.bb);
  return host;
}
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});
const rule = { enabled: true, limit: true, modelIds: ["a", "b"] };

describe("profiles RPC", () => {
  it("starts with Default only and publishes each committed change", async () => {
    const { harness } = await setup();
    const empty = (await harness.behavior.callRpc("getSnapshot", null)) as {
      revision: number;
      profiles: { id: string }[];
    };
    expect(empty).toMatchObject({ revision: 0, profiles: [{ id: "default" }] });
    const next = (await harness.behavior.callRpc("setHiddenModels", {
      mode: "remove",
    })) as { revision: number; hiddenModels: string };
    expect(next).toMatchObject({ revision: 1, hiddenModels: "remove" });
    expect(harness.realtimeSignals).toHaveLength(1);
  });
  it("creates, edits, assigns and deletes profiles", async () => {
    const { harness } = await setup();
    const call = (name: string, input: unknown) =>
      harness.behavior.callRpc(name as never, input as never) as Promise<any>;
    await call("setProvider", {
      profileId: "default",
      providerId: "alpha",
      rule,
    });
    await call("setDefaultModel", {
      profileId: "default",
      defaultModel: { providerId: "alpha", model: "a", reasoningLevel: "high" },
    });
    const created = await call("createProfile", {
      name: "Work",
      copyFromId: "default",
    });
    expect(created.snapshot.profiles[1]).toMatchObject({
      id: created.id,
      name: "Work",
      projectIds: [],
      providers: { alpha: rule },
      defaultModel: { providerId: "alpha", model: "a", reasoningLevel: "high" },
    });
    await call("renameProfile", { id: created.id, name: "Client" });
    const assigned = await call("setProfileProjects", {
      id: created.id,
      projectIds: ["p1"],
    });
    expect(assigned.profiles[1]).toMatchObject({
      name: "Client",
      projectIds: ["p1"],
    });
    await expect(
      call("createProfile", { name: "client", copyFromId: "default" }),
    ).rejects.toThrow(/exists/);
    await expect(call("deleteProfile", { id: "default" })).rejects.toThrow(
      /deleted/,
    );
    const removed = await call("deleteProfile", { id: created.id });
    expect(removed.profiles).toHaveLength(1);
    const reset = await call("reset", null);
    expect(reset.profiles[0].providers).toEqual({});
    expect(reset.revision).toBeGreaterThan(removed.revision);
  });
  it("refuses a limit with no models and strict extra fields", async () => {
    const { harness } = await setup();
    const call = (name: string, input: unknown) =>
      harness.behavior.callRpc(name as never, input as never);
    await expect(
      call("setProvider", {
        profileId: "default",
        providerId: "alpha",
        rule: { enabled: true, limit: true, modelIds: [] },
      }),
    ).rejects.toThrow();
    await expect(
      call("setProvider", {
        profileId: "default",
        providerId: "alpha",
        rule: { ...rule, extra: 1 },
      }),
    ).rejects.toThrow();
    expect(harness.realtimeSignals).toEqual([]);
  });
  it("persists through a plugin reload", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc(
      "setProvider" as never,
      {
        profileId: "default",
        providerId: "alpha",
        rule,
      } as never,
    );
    const reloaded = await harness.lifecycle.reload(plugin);
    hosts.push(reloaded);
    const snapshot = (await reloaded.harness.behavior.callRpc(
      "getSnapshot" as never,
      null as never,
    )) as { revision: number; profiles: { providers: object }[] };
    expect(snapshot.revision).toBe(1);
    expect(snapshot.profiles[0].providers).toEqual({ alpha: rule });
  });
});

describe("stored documents", () => {
  const insert = (
    db: ReturnType<
      typeof createFakePluginHost
    >["bb"]["storage"]["database"] extends () => infer D
      ? D
      : never,
    document: string,
  ) =>
    db
      .prepare(
        "INSERT INTO model_filter_preferences (singleton, document) VALUES (1, ?)",
      )
      .run(document);
  it("upgrades a version 1 document in place on the next change", async () => {
    const { bb, harness } = await setup();
    const db = bb.storage.database();
    insert(
      db,
      JSON.stringify({
        version: 1,
        snapshot: {
          revision: 4,
          providers: {
            alpha: {
              mode: "selected",
              modelIds: ["a"],
              preferredModelId: "a",
              favoriteIds: ["a"],
            },
          },
        },
      }),
    );
    const read = (await harness.behavior.callRpc(
      "getSnapshot" as never,
      null as never,
    )) as {
      revision: number;
      profiles: { defaultModel?: unknown; providers: object }[];
    };
    expect(read.revision).toBe(4);
    expect(read.profiles[0]).toMatchObject({
      providers: { alpha: { enabled: true, limit: true, modelIds: ["a"] } },
      defaultModel: { providerId: "alpha", model: "a" },
    });
    await harness.behavior.callRpc(
      "setHiddenModels" as never,
      { mode: "remove" } as never,
    );
    const stored = db
      .prepare(
        "SELECT document FROM model_filter_preferences WHERE singleton=1",
      )
      .get() as { document: string };
    expect(JSON.parse(stored.document)).toMatchObject({
      version: 2,
      snapshot: { revision: 5, hiddenModels: "remove" },
    });
  });
  it.each([
    "not-json",
    JSON.stringify({ version: 999, snapshot: {} }),
    JSON.stringify({ version: 2, snapshot: { revision: 0 } }),
  ])("refuses malformed state without erasing it: %s", async (document) => {
    const { bb, harness } = await setup();
    const db = bb.storage.database();
    insert(db, document);
    await expect(
      harness.behavior.callRpc("getSnapshot" as never, null as never),
    ).rejects.toThrow(/stored/i);
    await expect(
      harness.behavior.callRpc("reset" as never, null as never),
    ).rejects.toThrow();
    expect(
      db
        .prepare(
          "SELECT document FROM model_filter_preferences WHERE singleton=1",
        )
        .get(),
    ).toEqual({ document });
    expect(harness.realtimeSignals).toEqual([]);
  });
});

describe("CLI", () => {
  it("shows status and resets", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc(
      "setProvider" as never,
      {
        profileId: "default",
        providerId: "alpha",
        rule,
      } as never,
    );
    const text = await harness.behavior.runCli(["status"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("alpha: on, limited to 2 models");
    const json = await harness.behavior.runCli(["status", "--json"]);
    expect(JSON.parse(json.stdout as string).revision).toBe(1);
    expect((await harness.behavior.runCli(["reset", "--json"])).exitCode).toBe(
      0,
    );
    expect(
      JSON.parse(
        (await harness.behavior.runCli(["status", "--json"])).stdout as string,
      ).profiles[0].providers,
    ).toEqual({});
    expect((await harness.behavior.runCli(["prefer", "a", "b"])).exitCode).toBe(
      1,
    );
    expect((await harness.behavior.runCli(["reset", "x"])).exitCode).toBe(1);
  });
});

describe("custom models", () => {
  async function withDataDir() {
    const dataDir = await mkdtemp(join(tmpdir(), "profiles-server-"));
    const reloadConfig = vi.fn(async () => ({ ok: true }));
    const host = createFakePluginHost({
      pluginId: "profiles",
      dataDir,
      sdk: {
        system: {
          reloadConfig,
          executionOptions: async () => ({
            models: [{ model: "native" }],
            selectedOnlyModels: [{ model: "hidden-native" }],
          }),
        },
      } as never,
    });
    hosts.push(host);
    await plugin(host.bb);
    cleanups.push(() => rm(dataDir, { recursive: true, force: true }));
    return { host, dataDir, reloadConfig };
  }
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("adds, lists and removes through RPC, publishing a change each time", async () => {
    const { host, dataDir, reloadConfig } = await withDataDir();
    const call = (name: string, input: unknown) =>
      host.harness.behavior.callRpc(
        name as never,
        input as never,
      ) as Promise<any>;
    const added = await call("addCustomModel", {
      providerId: "acp-cursor",
      model: "grok-4.7",
      displayName: "Grok 4.7",
    });
    expect(added.models).toEqual([
      { providerId: "acp-cursor", model: "grok-4.7", displayName: "Grok 4.7" },
    ]);
    expect(
      JSON.parse(await readFile(join(dataDir, "config.json"), "utf8")),
    ).toEqual({ customModels: added.models });
    expect((await call("listCustomModels", null)).models).toHaveLength(1);
    await expect(
      call("addCustomModel", { providerId: "acp-cursor", model: "native" }),
    ).rejects.toThrow(/already lists/);
    await expect(
      call("addCustomModel", {
        providerId: "acp-cursor",
        model: "hidden-native",
      }),
    ).rejects.toThrow(/already lists/);
    await call("removeCustomModel", {
      providerId: "acp-cursor",
      model: "grok-4.7",
    });
    expect((await call("listCustomModels", null)).models).toEqual([]);
    expect(reloadConfig).toHaveBeenCalledTimes(2);
    expect(host.harness.realtimeSignals).toHaveLength(2);
  });

  it("drives the CLI and refuses a config it cannot parse", async () => {
    const { host, dataDir } = await withDataDir();
    const cli = (...argv: string[]) => host.harness.behavior.runCli(argv);
    expect((await cli("models", "list")).stdout).toBe("No custom models");
    const add = await cli("models", "add", "p", "m1", "My", "Model", "--json");
    expect(JSON.parse(add.stdout as string).models).toEqual([
      { providerId: "p", model: "m1", displayName: "My Model" },
    ]);
    expect((await cli("models", "list")).stdout).toBe("p/m1 (My Model)");
    expect((await cli("models", "remove", "p", "m1")).exitCode).toBe(0);
    expect((await cli("models", "add", "p")).exitCode).toBe(1);
    await writeFile(join(dataDir, "config.json"), "oops");
    const bad = await cli("models", "add", "p", "m2");
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toMatch(/not valid JSON/);
    expect(await readFile(join(dataDir, "config.json"), "utf8")).toBe("oops");
  });
});
