import { describe, expect, it } from "vitest";
import { planDefault, type DraftState } from "./composer-default";
import { limit, off, profile, snapshotOf } from "./test-utils";

const work = profile(
  "work",
  {},
  {
    projectIds: ["p1"],
    defaultModel: {
      providerId: "claude",
      model: "opus",
      reasoningLevel: "high",
    },
  },
);
const snapshot = snapshotOf(
  {},
  {
    defaultModel: { providerId: "codex", model: "gpt" },
    others: [work],
  },
);
const options = { draftEmpty: true, providers: ["codex", "claude"] };
const sel = (
  projectId: string | undefined,
  providerId = "codex",
  model = "x",
) => ({
  projectId,
  providerId,
  model,
});

describe("composer auto-default", () => {
  it("applies the profile default on first sight and never a service tier", () => {
    const plan = planDefault(undefined, sel("p1"), snapshot, options);
    expect(plan.apply).toEqual({
      providerId: "claude",
      model: "opus",
      reasoningLevel: "high",
    });
    expect(plan.apply).not.toHaveProperty("serviceTier");
    expect(plan.state.applied).toEqual({ providerId: "claude", model: "opus" });
  });
  it("does nothing when the composer already shows the default", () => {
    const plan = planDefault(
      undefined,
      {
        projectId: "p1",
        providerId: "claude",
        model: "opus",
        reasoningLevel: "high",
      },
      snapshot,
      options,
    );
    expect(plan.apply).toBeUndefined();
    expect(plan.state.userPicked).toBe(false);
  });
  it("re-applies when the project changes, even if BB reseeded the model", () => {
    const first = planDefault(undefined, sel("p1"), snapshot, options);
    const afterReseed = sel("p2", "codex", "bb-seeded");
    const plan = planDefault(first.state, afterReseed, snapshot, options);
    expect(plan.apply).toEqual({ providerId: "codex", model: "gpt" });
  });
  it("stops applying once the user picked a different model", () => {
    const first = planDefault(undefined, sel("p1"), snapshot, options);
    const picked = planDefault(
      first.state,
      sel("p1", "claude", "sonnet"),
      snapshot,
      options,
    );
    expect(picked.apply).toBeUndefined();
    expect(picked.state.userPicked).toBe(true);
    const later = planDefault(
      picked.state,
      sel("p2", "claude", "sonnet"),
      snapshot,
      options,
    );
    expect(later.apply).toBeUndefined();
  });
  it("does not re-apply while the selection still matches the last apply", () => {
    const first = planDefault(undefined, sel("p1"), snapshot, options);
    const same = planDefault(
      first.state,
      sel("p1", "claude", "opus"),
      snapshot,
      options,
    );
    expect(same.apply).toBeUndefined();
    expect(same.state.userPicked).toBe(false);
  });
  it("leaves a draft that already has content alone", () => {
    const plan = planDefault(undefined, sel("p1"), snapshot, {
      ...options,
      draftEmpty: false,
    });
    expect(plan.apply).toBeUndefined();
    expect(plan.state.userPicked).toBe(true);
  });
  it("uses Default for projects without a profile and for no project", () => {
    expect(
      planDefault(undefined, sel("other", "claude", "y"), snapshot, options)
        .apply,
    ).toEqual({
      providerId: "codex",
      model: "gpt",
    });
    expect(
      planDefault(undefined, sel(undefined, "claude", "y"), snapshot, options)
        .apply?.model,
    ).toBe("gpt");
  });
  it("leaves a disabled provider for the first enabled one when there is no default", () => {
    const s = snapshotOf({ codex: off });
    expect(planDefault(undefined, sel("p1"), s, options).apply).toEqual({
      providerId: "claude",
    });
    const waiting: DraftState | undefined = undefined;
    const plan = planDefault(waiting, sel("p1"), s, {
      draftEmpty: true,
      providers: null,
    });
    expect(plan.apply).toBeUndefined();
    expect(plan.state.project).toBeUndefined();
  });
  it("keeps the selection when no default applies and the provider is on", () => {
    const s = snapshotOf({ codex: limit("x") });
    const plan = planDefault(undefined, sel("p1"), s, options);
    expect(plan.apply).toBeUndefined();
    expect(plan.state.applied).toEqual({ providerId: "codex", model: "x" });
  });
});
