import { describe, expect, it } from "vitest";
import {
  attachQueryBridge,
  type QueryOptions,
  type QueryClientAdapter,
} from "./query-bridge";
import { bridgeState, limit, off, profile, snapshotOf } from "./test-utils";

const catalog = {
  providers: [{ id: "custom" }],
  models: [
    { model: "a", displayName: "A" },
    { model: "b", displayName: "B" },
    { model: "c", displayName: "C" },
  ],
  selectedOnlyModels: [],
};
const key = ["systemExecutionOptions", null, "host", "custom", null];
function host(
  initial: QueryOptions = { queryKey: key, placeholderData: () => catalog },
) {
  const listeners = new Set<(event: unknown) => void>();
  const client: QueryClientAdapter = {
    defaultQueryOptions: (options) => options,
    getQueryCache: () => ({
      getAll: () => [query],
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
  };
  const observer = {
    options: initial,
    result: catalog as unknown,
    setOptions(options: QueryOptions) {
      this.options = client.defaultQueryOptions(options);
      this.result = this.options.select
        ? this.options.select(catalog)
        : catalog;
    },
  };
  const query = { queryKey: key, observers: [observer] };
  return { client, observer, query, listeners };
}
const selected = bridgeState(
  snapshotOf({ custom: limit("b") }, { hiddenModels: "remove" }),
);

describe("native observer data bridge", () => {
  it("projects existing observers without mutating raw model availability", () => {
    const { client, observer } = host();
    const bridge = attachQueryBridge(client, selected);
    expect(
      (observer.result as typeof catalog).models.map((m) => m.model),
    ).toEqual(["b"]);
    expect(catalog.models.map((m) => m.model)).toEqual(["a", "b", "c"]);
    expect([
      ...(observer.result as typeof catalog).selectedOnlyModels,
    ]).toHaveLength(2);
    bridge.dispose();
    expect(observer.result).toBe(catalog);
  });
  it("decorates cached placeholders and rotates both identities on a preference change", () => {
    const { client, observer } = host();
    const bridge = attachQueryBridge(client, selected);
    const previousSelect = observer.options.select;
    const previousPlaceholder = observer.options.placeholderData;
    bridge.update(
      bridgeState(
        snapshotOf({ custom: limit("c") }, { hiddenModels: "remove" }),
      ),
    );
    expect(observer.options.select).not.toBe(previousSelect);
    expect(observer.options.placeholderData).not.toBe(previousPlaceholder);
    const placeholder = (observer.options.placeholderData as () => unknown)();
    expect(
      (observer.options.select!(placeholder) as typeof catalog).models.map(
        (m) => m.model,
      ),
    ).toEqual(["c"]);
    const again = client.defaultQueryOptions(observer.options);
    expect(again.select).toBe(observer.options.select);
    expect(again.placeholderData).toBe(observer.options.placeholderData);
    bridge.dispose();
  });
  it("composes pre-existing selectors and leaves unrelated queries alone", () => {
    const native = (data: unknown) =>
      (data as typeof catalog).models.map((m) => m.model);
    const { client, observer } = host({ queryKey: key, select: native });
    const bridge = attachQueryBridge(client, selected);
    expect(observer.result).toEqual(["b"]);
    const unrelated = { queryKey: ["threads"], select: native };
    expect(client.defaultQueryOptions(unrelated)).toBe(unrelated);
    bridge.dispose();
    expect(observer.options.select).toBe(native);
  });
  it("uses the actual returned provider when the requested provider is unavailable", () => {
    const { client } = host();
    const bridge = attachQueryBridge(client, selected);
    const options = client.defaultQueryOptions({
      queryKey: [...key.slice(0, 3), "missing", null],
    });
    expect(
      (options.select!(catalog) as typeof catalog).models.map((m) => m.model),
    ).toEqual(["b"]);
    bridge.dispose();
  });
  it("preserves another wrapper installed later and makes retained selectors inert after cleanup", () => {
    const { client, observer } = host();
    const original = client.defaultQueryOptions;
    const bridge = attachQueryBridge(client, selected);
    const retained = observer.options.select!;
    const ours = client.defaultQueryOptions;
    const other = (options: QueryOptions) => ours(options);
    client.defaultQueryOptions = other;
    bridge.dispose();
    expect(client.defaultQueryOptions).toBe(other);
    expect(retained(catalog)).toBe(catalog);
    client.defaultQueryOptions = original;
  });
  it("covers newly attached observers and disposes its cache subscription", () => {
    const { client, listeners } = host();
    const bridge = attachQueryBridge(client, selected);
    const options = client.defaultQueryOptions({ queryKey: key });
    expect((options.select!(catalog) as typeof catalog).models).toHaveLength(1);
    expect(listeners.size).toBe(1);
    bridge.dispose();
    bridge.dispose();
    expect(listeners.size).toBe(0);
  });
  it("leaves an unconfigured provider with a prototype-shaped ID untouched", () => {
    const { client } = host();
    const bridge = attachQueryBridge(client, selected);
    const data = { ...catalog, providers: [{ id: "__proto__" }] };
    const options = client.defaultQueryOptions({
      queryKey: [...key.slice(0, 3), "__proto__", null],
    });
    expect(options.select!(data)).toBe(data);
    bridge.dispose();
  });
  it("moves unselected models to More models in the default hidden mode", () => {
    const { client } = host();
    const bridge = attachQueryBridge(
      client,
      bridgeState(snapshotOf({ custom: limit("b") })),
    );
    const data = client.defaultQueryOptions({ queryKey: key }).select!(
      catalog,
    ) as typeof catalog;
    expect(data.models.map((m) => m.model)).toEqual(["b"]);
    expect(
      [...data.selectedOnlyModels].map((m: { model: string }) => m.model),
    ).toEqual(["a", "c"]);
    bridge.dispose();
  });
  it("resolves the project from the environment map, then the composer project", () => {
    const { client } = host();
    const snapshot = snapshotOf(
      {},
      {
        others: [
          profile("only-b", { custom: limit("b") }, { projectIds: ["p1"] }),
          profile("only-c", { custom: limit("c") }, { projectIds: ["p2"] }),
        ],
      },
    );
    const bridge = attachQueryBridge(
      client,
      bridgeState(snapshot, {
        environmentProjects: { env1: "p1" },
        composerProjectId: "p2",
      }),
    );
    const models = (k: unknown[]) =>
      (
        client.defaultQueryOptions({ queryKey: k }).select!(
          catalog,
        ) as typeof catalog
      ).models.map((m) => m.model);
    expect(
      models(["systemExecutionOptions", "env1", "host", "custom", null]),
    ).toEqual(["b"]);
    expect(models(key)).toEqual(["c"]);
    bridge.update(bridgeState(snapshot, { composerProjectId: null }));
    expect(models(key)).toEqual(["a", "b", "c"]);
    bridge.dispose();
  });
  it("reports an unknown environment once per lookup and uses Default meanwhile", async () => {
    const { client } = host();
    const seen: string[] = [];
    const bridge = attachQueryBridge(
      client,
      bridgeState(snapshotOf({ custom: limit("a") })),
      (id) => seen.push(id),
    );
    const options = client.defaultQueryOptions({
      queryKey: ["systemExecutionOptions", "env9", "host", "custom", null],
    });
    expect((options.select!(catalog) as typeof catalog).models).toHaveLength(1);
    await Promise.resolve();
    expect(seen).toEqual(["env9"]);
    bridge.dispose();
  });
});
