export interface ProviderRule {
  enabled: boolean;
  limit: boolean;
  modelIds: string[];
}
export interface DefaultModel {
  providerId: string;
  model: string;
  reasoningLevel?: string;
}
export interface Profile {
  id: string;
  name: string;
  projectIds: string[];
  providers: Record<string, ProviderRule>;
  defaultModel?: DefaultModel;
}
export type HiddenModels = "more" | "remove";
export interface Snapshot {
  revision: number;
  hiddenModels: HiddenModels;
  profiles: Profile[];
}

export const DEFAULT_PROFILE_ID = "default";
export const MAX_ID_LENGTH = 512;
export const MAX_NAME_LENGTH = 60;
export const MAX_MODELS = 1024;
export const MAX_PROVIDERS = 128;
export const MAX_PROFILES = 64;
export const MAX_PROJECTS = 1024;
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
export const INITIAL_SNAPSHOT: Snapshot = {
  revision: 0,
  hiddenModels: "more",
  profiles: [
    { id: DEFAULT_PROFILE_ID, name: "Default", projectIds: [], providers: {} },
  ],
};

/** A change the caller asked for that the data model does not allow. */
export class ProfileError extends Error {}

export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function idList(value: unknown, max: number, what: string): string[] {
  if (!Array.isArray(value) || value.length > max || !value.every(validId))
    throw new ProfileError(`Invalid ${what}`);
  return [...new Set(value as string[])];
}

export function normalizeName(input: unknown): string {
  const name = typeof input === "string" ? input.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME_LENGTH)
    throw new ProfileError(`Name must be 1 to ${MAX_NAME_LENGTH} characters`);
  if (/[\u0000-\u001f\u007f]/u.test(name))
    throw new ProfileError("Name contains control characters");
  return name;
}

export function normalizeRule(input: unknown): ProviderRule {
  if (
    !object(input) ||
    !onlyKeys(input, ["enabled", "limit", "modelIds"]) ||
    typeof input.enabled !== "boolean" ||
    typeof input.limit !== "boolean"
  )
    throw new ProfileError("Invalid provider rule");
  const modelIds = idList(input.modelIds, MAX_MODELS, "model IDs");
  if (input.limit && modelIds.length === 0)
    throw new ProfileError("Select at least one model");
  return { enabled: input.enabled, limit: input.limit, modelIds };
}

export function normalizeDefaultModel(input: unknown): DefaultModel {
  if (
    !object(input) ||
    !onlyKeys(input, ["providerId", "model", "reasoningLevel"]) ||
    !validId(input.providerId) ||
    !validId(input.model) ||
    (input.reasoningLevel !== undefined && !validId(input.reasoningLevel))
  )
    throw new ProfileError("Invalid default model");
  return {
    providerId: input.providerId,
    model: input.model,
    ...(input.reasoningLevel !== undefined
      ? { reasoningLevel: input.reasoningLevel }
      : {}),
  };
}

function parseProfile(input: unknown): Profile {
  if (
    !object(input) ||
    !onlyKeys(input, [
      "id",
      "name",
      "projectIds",
      "providers",
      "defaultModel",
    ]) ||
    !validId(input.id) ||
    !object(input.providers) ||
    Object.keys(input.providers).length > MAX_PROVIDERS
  )
    throw new ProfileError("Invalid profile");
  const providers: Record<string, ProviderRule> = {};
  for (const [id, rule] of Object.entries(input.providers)) {
    if (!validId(id)) throw new ProfileError("Invalid provider ID");
    Object.defineProperty(providers, id, {
      value: normalizeRule(rule),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return {
    id: input.id,
    name: normalizeName(input.name),
    projectIds: idList(input.projectIds, MAX_PROJECTS, "project IDs"),
    providers,
    ...(input.defaultModel !== undefined
      ? { defaultModel: normalizeDefaultModel(input.defaultModel) }
      : {}),
  };
}

export function parseSnapshot(input: unknown): Snapshot {
  if (
    !object(input) ||
    !onlyKeys(input, ["revision", "hiddenModels", "profiles"]) ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    (input.hiddenModels !== "more" && input.hiddenModels !== "remove") ||
    !Array.isArray(input.profiles) ||
    input.profiles.length < 1 ||
    input.profiles.length > MAX_PROFILES
  )
    throw new ProfileError("Invalid stored profiles");
  const profiles = input.profiles.map(parseProfile);
  const [first] = profiles;
  if (
    first.id !== DEFAULT_PROFILE_ID ||
    first.name !== "Default" ||
    first.projectIds.length > 0
  )
    throw new ProfileError("The first profile must be the Default profile");
  const ids = new Set<string>();
  const names = new Set<string>();
  const projects = new Set<string>();
  for (const profile of profiles) {
    const name = profile.name.toLowerCase();
    if (ids.has(profile.id) || names.has(name))
      throw new ProfileError("Profile IDs and names must be unique");
    ids.add(profile.id);
    names.add(name);
    for (const projectId of profile.projectIds) {
      if (projects.has(projectId))
        throw new ProfileError("A project can belong to one profile only");
      projects.add(projectId);
    }
  }
  const snapshot: Snapshot = {
    revision: input.revision as number,
    hiddenModels: input.hiddenModels,
    profiles,
  };
  if (
    new TextEncoder().encode(JSON.stringify(snapshot)).byteLength >
    MAX_SNAPSHOT_BYTES
  )
    throw new ProfileError("Profiles exceed the size limit");
  return snapshot;
}

/** Convert a stored version 1 snapshot (Model Manager) into profiles.
 * Provider rules move to Default, the first preferred model becomes its
 * default model, and favorites and order are dropped.
 */
export function convertV1(input: unknown): Snapshot {
  if (
    !object(input) ||
    !Number.isSafeInteger(input.revision) ||
    !object(input.providers)
  )
    throw new ProfileError("Invalid stored preferences");
  const providers: Record<string, ProviderRule> = {};
  let defaultModel: DefaultModel | undefined;
  for (const [id, rule] of Object.entries(input.providers)) {
    if (
      !validId(id) ||
      !object(rule) ||
      (rule.mode !== "all" && rule.mode !== "selected") ||
      !Array.isArray(rule.modelIds) ||
      !rule.modelIds.every(validId)
    )
      continue;
    const modelIds = [...new Set(rule.modelIds as string[])];
    const limit = rule.mode === "selected";
    if (limit && modelIds.length === 0) continue;
    Object.defineProperty(providers, id, {
      value: { enabled: true, limit, modelIds },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    if (!defaultModel && validId(rule.preferredModelId))
      defaultModel = {
        providerId: id,
        model: rule.preferredModelId,
        ...(validId(rule.preferredReasoning)
          ? { reasoningLevel: rule.preferredReasoning }
          : {}),
      };
  }
  return parseSnapshot({
    revision: input.revision,
    hiddenModels: "more",
    profiles: [
      {
        id: DEFAULT_PROFILE_ID,
        name: "Default",
        projectIds: [],
        providers,
        ...(defaultModel ? { defaultModel } : {}),
      },
    ],
  });
}

export function getProviderRule(
  profile: Profile | undefined,
  providerId: string,
): ProviderRule | undefined {
  return profile && Object.hasOwn(profile.providers, providerId)
    ? profile.providers[providerId]
    : undefined;
}

export function resolveProfile(
  snapshot: Snapshot,
  projectId: string | null | undefined,
): Profile {
  return (
    (projectId
      ? snapshot.profiles.find((profile) =>
          profile.projectIds.includes(projectId),
        )
      : undefined) ?? snapshot.profiles[0]
  );
}

/* Profile operations: pure, each returns the next snapshot (revision is the
 * store's business). */

function find(snapshot: Snapshot, id: string): Profile {
  const profile = snapshot.profiles.find((item) => item.id === id);
  if (!profile) throw new ProfileError("Unknown profile");
  return profile;
}
function replace(snapshot: Snapshot, next: Profile): Snapshot {
  return {
    ...snapshot,
    profiles: snapshot.profiles.map((item) =>
      item.id === next.id ? next : item,
    ),
  };
}
function assertUniqueName(snapshot: Snapshot, name: string, exceptId?: string) {
  if (
    snapshot.profiles.some(
      (item) =>
        item.id !== exceptId && item.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new ProfileError("A profile with this name already exists");
}
function cloneProviders(
  providers: Record<string, ProviderRule>,
): Record<string, ProviderRule> {
  const copy: Record<string, ProviderRule> = {};
  for (const [id, rule] of Object.entries(providers))
    Object.defineProperty(copy, id, {
      value: { ...rule, modelIds: [...rule.modelIds] },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return copy;
}

export function setHiddenModels(
  snapshot: Snapshot,
  mode: HiddenModels,
): Snapshot {
  return { ...snapshot, hiddenModels: mode };
}

export function createProfile(
  snapshot: Snapshot,
  name: unknown,
  copyFromId: string,
  id: string,
): { snapshot: Snapshot; id: string } {
  const clean = normalizeName(name);
  assertUniqueName(snapshot, clean);
  const source = find(snapshot, copyFromId);
  if (snapshot.profiles.length >= MAX_PROFILES)
    throw new ProfileError("Too many profiles");
  if (snapshot.profiles.some((item) => item.id === id))
    throw new ProfileError("Profile ID collision");
  const profile: Profile = {
    id,
    name: clean,
    projectIds: [],
    providers: cloneProviders(source.providers),
    ...(source.defaultModel
      ? { defaultModel: { ...source.defaultModel } }
      : {}),
  };
  return {
    snapshot: { ...snapshot, profiles: [...snapshot.profiles, profile] },
    id,
  };
}

export function renameProfile(
  snapshot: Snapshot,
  id: string,
  name: unknown,
): Snapshot {
  if (id === DEFAULT_PROFILE_ID)
    throw new ProfileError("The Default profile cannot be renamed");
  const profile = find(snapshot, id);
  const clean = normalizeName(name);
  assertUniqueName(snapshot, clean, id);
  return replace(snapshot, { ...profile, name: clean });
}

export function deleteProfile(snapshot: Snapshot, id: string): Snapshot {
  if (id === DEFAULT_PROFILE_ID)
    throw new ProfileError("The Default profile cannot be deleted");
  find(snapshot, id);
  return {
    ...snapshot,
    profiles: snapshot.profiles.filter((item) => item.id !== id),
  };
}

export function setProfileProjects(
  snapshot: Snapshot,
  id: string,
  projectIds: unknown,
): Snapshot {
  if (id === DEFAULT_PROFILE_ID)
    throw new ProfileError("Projects not assigned to a profile use Default");
  find(snapshot, id);
  const ids = idList(projectIds, MAX_PROJECTS, "project IDs");
  const moved = new Set(ids);
  return {
    ...snapshot,
    profiles: snapshot.profiles.map((item) =>
      item.id === id
        ? { ...item, projectIds: ids }
        : { ...item, projectIds: item.projectIds.filter((p) => !moved.has(p)) },
    ),
  };
}

function defaultStillAllowed(profile: Profile): boolean {
  const dm = profile.defaultModel;
  if (!dm) return true;
  const rule = getProviderRule(profile, dm.providerId);
  return (
    !rule || (rule.enabled && (!rule.limit || rule.modelIds.includes(dm.model)))
  );
}

/** A provider that is switched off or limited to other models cannot also be
 * the profile's default model, so that default is cleared.
 */
export function setProvider(
  snapshot: Snapshot,
  profileId: string,
  providerId: string,
  rule: unknown,
): Snapshot {
  const profile = find(snapshot, profileId);
  if (!validId(providerId)) throw new ProfileError("Invalid provider ID");
  if (
    !Object.hasOwn(profile.providers, providerId) &&
    Object.keys(profile.providers).length >= MAX_PROVIDERS
  )
    throw new ProfileError("Too many configured providers");
  const providers = cloneProviders(profile.providers);
  Object.defineProperty(providers, providerId, {
    value: normalizeRule(rule),
    enumerable: true,
    configurable: true,
    writable: true,
  });
  let next: Profile = { ...profile, providers };
  if (!defaultStillAllowed(next)) {
    const { defaultModel: _dropped, ...rest } = next;
    next = rest;
  }
  return replace(snapshot, next);
}

export function setDefaultModel(
  snapshot: Snapshot,
  profileId: string,
  defaultModel: unknown,
): Snapshot {
  const profile = find(snapshot, profileId);
  const { defaultModel: _old, ...rest } = profile;
  if (defaultModel === null || defaultModel === undefined)
    return replace(snapshot, rest);
  const next = { ...rest, defaultModel: normalizeDefaultModel(defaultModel) };
  if (!defaultStillAllowed(next))
    throw new ProfileError("The default model is hidden by this profile");
  return replace(snapshot, next);
}

/* Picker projection. */

export interface CatalogModel {
  model: string;
  displayName?: string;
}
export interface Catalog {
  providers: { id: string }[];
  models: CatalogModel[];
  selectedOnlyModels?: CatalogModel[];
}

function unique<M extends CatalogModel>(models: M[]): M[] {
  const seen = new Set<string>();
  return models.filter(
    (item) => !seen.has(item.model) && Boolean(seen.add(item.model)),
  );
}

/** Reduce a model-list response to what the profile shows. Providers that the
 * profile turns off are removed, except the one the list was requested for.
 * With "limit" on, the main list holds the selected models; the others go to
 * "More models" or, in remove mode, behind a facade that keeps the current
 * model findable.
 */
export function projectCatalog<T extends Catalog>(
  data: T,
  profile: Profile,
  hiddenModels: HiddenModels,
  requested: string | null,
): T {
  const active =
    requested && data.providers.some((p) => p.id === requested)
      ? requested
      : data.providers[0]?.id;
  const providers = data.providers.filter(
    (p) => p.id === active || getProviderRule(profile, p.id)?.enabled !== false,
  );
  const base: T =
    providers.length === data.providers.length ? data : { ...data, providers };
  const rule = active ? getProviderRule(profile, active) : undefined;
  if (!rule?.limit) return base;
  const allowed = new Set(rule.modelIds);
  const originalMore = unique(data.selectedOnlyModels ?? []);
  if (
    ![...data.models, ...originalMore].some((item) => allowed.has(item.model))
  )
    return base;
  const models = data.models.filter((item) => allowed.has(item.model));
  const hidden = data.models.filter((item) => !allowed.has(item.model));
  const selectedOnlyModels = unique([...originalMore, ...hidden]);
  if (hiddenModels === "more") return { ...base, models, selectedOnlyModels };
  const visibleMore = originalMore.filter((item) => allowed.has(item.model));
  type Predicate = (
    value: CatalogModel,
    index: number,
    array: CatalogModel[],
  ) => unknown;
  // Enumerable array methods make TanStack's structural sharing retain this
  // local facade rather than copying its indexed values into a plain array.
  Object.defineProperties(selectedOnlyModels, {
    filter: {
      enumerable: true,
      configurable: true,
      value: (predicate: Predicate, thisArg?: unknown) =>
        visibleMore.filter(predicate, thisArg),
    },
    find: {
      enumerable: true,
      configurable: true,
      value: (predicate: Predicate, thisArg?: unknown) => {
        const found = Array.prototype.find.call(
          selectedOnlyModels,
          predicate,
          thisArg,
        ) as CatalogModel | undefined;
        if (!found || allowed.has(found.model)) return found;
        return {
          ...found,
          displayName: `${found.displayName ?? found.model} (Current)`,
        };
      },
    },
  });
  return { ...base, models, selectedOnlyModels };
}
