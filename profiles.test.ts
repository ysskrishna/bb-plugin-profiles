import { describe, expect, it } from "vitest";
import {
  ProfileError,
  convertV1,
  createProfile,
  deleteProfile,
  parseSnapshot,
  projectCatalog,
  renameProfile,
  resolveProfile,
  setDefaultModel,
  setProfileProjects,
  setProvider,
  type Snapshot,
} from "./profiles";
import { limit, off, profile, snapshotOf } from "./test-utils";

describe("v1 conversion", () => {
  it("moves rules to Default, promotes the first preferred model, drops favorites and order", () => {
    const converted = convertV1({
      revision: 7,
      providers: {
        alpha: {
          mode: "all",
          modelIds: ["x"],
          favoriteIds: ["x"],
          modelOrder: ["x"],
        },
        beta: {
          mode: "selected",
          modelIds: ["a", "b"],
          preferredModelId: "b",
          preferredReasoning: "high",
        },
        gamma: { mode: "selected", modelIds: ["c"], preferredModelId: "c" },
        broken: { mode: "selected", modelIds: [] },
      },
    });
    expect(converted).toEqual({
      revision: 7,
      hiddenModels: "more",
      profiles: [
        {
          id: "default",
          name: "Default",
          projectIds: [],
          providers: {
            alpha: { enabled: true, limit: false, modelIds: ["x"] },
            beta: { enabled: true, limit: true, modelIds: ["a", "b"] },
            gamma: { enabled: true, limit: true, modelIds: ["c"] },
          },
          defaultModel: {
            providerId: "beta",
            model: "b",
            reasoningLevel: "high",
          },
        },
      ],
    });
  });
  it("rejects a document that is not a v1 snapshot", () => {
    expect(() => convertV1({ revision: -1, providers: {} })).toThrow();
    expect(() => convertV1(null)).toThrow();
  });
});

describe("snapshot validation", () => {
  const valid = snapshotOf({ a: limit("m") });
  it("accepts a valid snapshot and rejects broken invariants", () => {
    expect(parseSnapshot(valid)).toEqual(valid);
    const dup = (profiles: unknown[]) => ({ ...valid, profiles });
    const named = (id: string, name: string, projectIds: string[] = []) => ({
      id,
      name,
      projectIds,
      providers: {},
    });
    expect(() => parseSnapshot(dup([named("x", "Default")]))).toThrow();
    expect(() =>
      parseSnapshot(dup([valid.profiles[0], named("p", "A"), named("q", "a")])),
    ).toThrow(/unique/);
    expect(() =>
      parseSnapshot(
        dup([
          valid.profiles[0],
          named("p", "A", ["1"]),
          named("q", "B", ["1"]),
        ]),
      ),
    ).toThrow(/one profile/);
    expect(() => parseSnapshot({ ...valid, hiddenModels: "nope" })).toThrow();
    expect(() =>
      parseSnapshot(
        snapshotOf({ a: { enabled: true, limit: true, modelIds: [] } }),
      ),
    ).toThrow(/at least one/);
  });
});

describe("profile operations", () => {
  const base = (): Snapshot =>
    snapshotOf(
      { alpha: limit("a", "b") },
      { defaultModel: { providerId: "alpha", model: "a" } },
    );
  it("copies a profile deeply so the copy is independent", () => {
    const { snapshot, id } = createProfile(base(), "  Work ", "default", "p1");
    const copy = snapshot.profiles.find((p) => p.id === id)!;
    expect(copy).toMatchObject({ name: "Work", projectIds: [] });
    expect(copy.providers).toEqual(snapshot.profiles[0].providers);
    expect(copy.providers.alpha).not.toBe(snapshot.profiles[0].providers.alpha);
    const changed = setProvider(snapshot, "p1", "alpha", limit("b"));
    expect(changed.profiles[0].providers.alpha.modelIds).toEqual(["a", "b"]);
    expect(changed.profiles[1].providers.alpha.modelIds).toEqual(["b"]);
    expect(copy.defaultModel).toEqual({ providerId: "alpha", model: "a" });
  });
  it("keeps names unique ignoring case, and Default fixed", () => {
    const { snapshot } = createProfile(base(), "Work", "default", "p1");
    expect(() => createProfile(snapshot, "work", "default", "p2")).toThrow(
      ProfileError,
    );
    expect(() => createProfile(snapshot, "default", "default", "p2")).toThrow(
      /exists/,
    );
    expect(() => createProfile(snapshot, "   ", "default", "p2")).toThrow(
      ProfileError,
    );
    expect(() => renameProfile(snapshot, "default", "Other")).toThrow(
      /renamed/,
    );
    expect(() => deleteProfile(snapshot, "default")).toThrow(/deleted/);
    expect(() => setProfileProjects(snapshot, "default", ["x"])).toThrow(
      ProfileError,
    );
    expect(renameProfile(snapshot, "p1", "WORK").profiles[1].name).toBe("WORK");
  });
  it("moves projects out of other profiles, and deleting returns them to Default", () => {
    let s = createProfile(base(), "A", "default", "pa").snapshot;
    s = createProfile(s, "B", "default", "pb").snapshot;
    s = setProfileProjects(s, "pa", ["p1", "p2", "p1"]);
    s = setProfileProjects(s, "pb", ["p2", "p3"]);
    expect(s.profiles.find((p) => p.id === "pa")!.projectIds).toEqual(["p1"]);
    expect(s.profiles.find((p) => p.id === "pb")!.projectIds).toEqual([
      "p2",
      "p3",
    ]);
    expect(resolveProfile(s, "p2").id).toBe("pb");
    s = deleteProfile(s, "pb");
    expect(resolveProfile(s, "p2").id).toBe("default");
    expect(resolveProfile(s, "p1").id).toBe("pa");
    expect(resolveProfile(s, null).id).toBe("default");
    expect(() => parseSnapshot(s)).not.toThrow();
  });
  it("clears a default model that its provider rule would hide", () => {
    const off1 = setProvider(base(), "default", "alpha", off);
    expect(off1.profiles[0].defaultModel).toBeUndefined();
    const other = setProvider(base(), "default", "alpha", limit("b"));
    expect(other.profiles[0].defaultModel).toBeUndefined();
    const kept = setProvider(base(), "default", "alpha", limit("a"));
    expect(kept.profiles[0].defaultModel).toBeDefined();
    expect(() =>
      setDefaultModel(base(), "default", { providerId: "alpha", model: "zzz" }),
    ).toThrow(/hidden/);
    expect(
      setDefaultModel(base(), "default", null).profiles[0].defaultModel,
    ).toBeUndefined();
  });
});

describe("picker projection", () => {
  const data = {
    providers: [{ id: "alpha" }, { id: "beta" }],
    models: [{ model: "a" }, { model: "b" }, { model: "c" }],
    selectedOnlyModels: [{ model: "old" }],
  };
  const ids = (list: { model: string }[]) => [...list].map((m) => m.model);
  it("removes disabled providers but never the requested one", () => {
    const p = profile("default", { beta: off, alpha: off });
    expect(projectCatalog(data, p, "more", null).providers).toEqual([
      { id: "alpha" },
    ]);
    expect(projectCatalog(data, p, "more", "alpha").providers).toEqual([
      { id: "alpha" },
    ]);
    const betaOff = profile("default", { beta: off });
    expect(projectCatalog(data, betaOff, "more", "alpha").providers).toEqual([
      { id: "alpha" },
    ]);
    expect(projectCatalog(data, betaOff, "more", "beta").providers).toEqual(
      data.providers,
    );
  });
  it("leaves the catalog untouched without a limit", () => {
    const p = profile("default", {
      alpha: { enabled: true, limit: false, modelIds: ["a"] },
    });
    expect(projectCatalog(data, p, "more", "alpha")).toBe(data);
  });
  it("shows only selected models and sends the rest to More models", () => {
    const out = projectCatalog(
      data,
      profile("default", { alpha: limit("b") }),
      "more",
      "alpha",
    );
    expect(ids(out.models)).toEqual(["b"]);
    expect(ids(out.selectedOnlyModels)).toEqual(["old", "a", "c"]);
    expect(ids(out.selectedOnlyModels.filter(() => true))).toEqual([
      "old",
      "a",
      "c",
    ]);
  });
  it("removes unselected models in remove mode but keeps the current one findable", () => {
    const out = projectCatalog(
      data,
      profile("default", { alpha: limit("b") }),
      "remove",
      "alpha",
    );
    expect(ids(out.models)).toEqual(["b"]);
    expect(out.selectedOnlyModels.filter(() => true)).toEqual([]);
    expect(out.selectedOnlyModels.find((m) => m.model === "c")).toEqual({
      model: "c",
      displayName: "c (Current)",
    });
    expect(data.models).toHaveLength(3);
  });
  it("returns the catalog unchanged when no selected model exists", () => {
    const p = profile("default", { alpha: limit("gone") });
    expect(projectCatalog(data, p, "remove", "alpha")).toBe(data);
  });
});
