import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { attachQueryBridge, type QueryClientAdapter } from "./query-bridge";
import { bridgeState, limit, snapshotOf } from "./test-utils";
const key = ["systemExecutionOptions", null, "host", "custom", null];
const raw = {
  providers: [{ id: "custom" }],
  models: [
    { model: "a", displayName: "A" },
    { model: "b", displayName: "B" },
    { model: "c", displayName: "C" },
  ],
  selectedOnlyModels: [],
};
describe("installed TanStack observer behavior", () => {
  it("filters selected-model discovery queries without changing their raw catalog", () => {
    const selectedKey = [...key, "b"];
    const client = new QueryClient();
    client.setQueryData(selectedKey, raw);
    const bridge = attachQueryBridge(
      client as unknown as QueryClientAdapter,
      bridgeState(
        snapshotOf({ custom: limit("b") }, { hiddenModels: "remove" }),
      ),
    );
    const observer = new QueryObserver<typeof raw>(client, {
      queryKey: selectedKey,
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(
        observer.getCurrentResult().data!.models.map((m) => m.model),
      ).toEqual(["b"]);
      expect(client.getQueryData(selectedKey)).toEqual(raw);
      bridge.update(
        bridgeState(
          snapshotOf({ custom: limit("c") }, { hiddenModels: "remove" }),
        ),
      );
      expect(
        observer.getCurrentResult().data!.models.map((m) => m.model),
      ).toEqual(["c"]);
    } finally {
      bridge.dispose();
      unsubscribe();
      client.clear();
    }
  });
  it("filters remembered placeholders and recomputes them after a remote rule change", () => {
    const client = new QueryClient();
    const observer = new QueryObserver<typeof raw>(client, {
      queryKey: key,
      enabled: false,
      placeholderData: () => raw,
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    const bridge = attachQueryBridge(
      client as unknown as QueryClientAdapter,
      bridgeState(
        snapshotOf({ custom: limit("b") }, { hiddenModels: "remove" }),
      ),
    );
    expect(
      observer.getCurrentResult().data!.models.map((m) => m.model),
    ).toEqual(["b"]);
    bridge.update(
      bridgeState(
        snapshotOf({ custom: limit("c") }, { hiddenModels: "remove" }),
      ),
    );
    expect(
      observer.getCurrentResult().data!.models.map((m) => m.model),
    ).toEqual(["c"]);
    expect(client.getQueryData(key)).toBeUndefined();
    bridge.dispose();
    expect(observer.getCurrentResult().data!.models).toEqual(raw.models);
    unsubscribe();
    client.clear();
  });
  it("keeps raw cached availability intact while new native observers receive a projection", () => {
    const client = new QueryClient();
    client.setQueryData(key, raw);
    const bridge = attachQueryBridge(
      client as unknown as QueryClientAdapter,
      bridgeState(
        snapshotOf({ custom: limit("b") }, { hiddenModels: "remove" }),
      ),
    );
    const observer = new QueryObserver<typeof raw>(client, {
      queryKey: key,
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    const data = observer.getCurrentResult().data as typeof raw;
    expect(data.models.map((m) => m.model)).toEqual(["b"]);
    expect(data.selectedOnlyModels.filter(() => true)).toEqual([]);
    expect(
      [...data.selectedOnlyModels].map((m: { model: string }) => m.model),
    ).toEqual(["a", "c"]);
    expect(client.getQueryData(key)).toEqual(raw);
    bridge.dispose();
    expect(observer.getCurrentResult().data).toEqual(raw);
    unsubscribe();
    client.clear();
  });
});
