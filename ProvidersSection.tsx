import { useMemo, useState } from "react";
import { getProviderRule, type Profile, type ProviderRule } from "./profiles";
import type { CatalogState, ProviderOption } from "./settings-data";
import { SettingsSection, SwitchRow, type SaveStatus } from "./settings-ui";
import { cn } from "./lib/utils";

const DEFAULT_RULE: ProviderRule = {
  enabled: true,
  limit: false,
  modelIds: [],
};

export function ProvidersSection({
  profile,
  providers,
  catalogs,
  status,
  error,
  onChange,
}: {
  profile: Profile;
  providers: ProviderOption[];
  catalogs: Record<string, CatalogState>;
  status: SaveStatus | undefined;
  error: string | null;
  onChange: (
    providerId: string,
    update: (rule: ProviderRule) => ProviderRule,
  ) => void;
}) {
  const [tab, setTab] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const current = providers.find((p) => p.id === tab) ?? providers[0];
  const rule =
    (current && getProviderRule(profile, current.id)) || DEFAULT_RULE;
  const catalog = current ? catalogs[current.id] : undefined;
  const models = catalog?.status === "ready" ? catalog.models : [];
  const known = useMemo(() => new Set(models.map((m) => m.model)), [models]);
  const selected = new Set(rule.modelIds);
  const selectedCount = models.filter((m) => selected.has(m.model)).length;
  const unavailable = rule.modelIds.filter((id) => !known.has(id));
  const shown = models.filter((m) =>
    `${m.displayName} ${m.model}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const change = (update: (rule: ProviderRule) => ProviderRule) =>
    current && onChange(current.id, update);

  return (
    <SettingsSection title={`Providers in "${profile.name}"`} status={status}>
      {error ? (
        <p role="alert" className="px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {providers.length === 0 || !current ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No providers available.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Providers"
            className="flex flex-wrap gap-1 border-b border-border px-3 pb-1.5 pt-0.5"
          >
            {providers.map((provider) => {
              const off =
                getProviderRule(profile, provider.id)?.enabled === false;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="tab"
                  aria-selected={provider.id === current.id}
                  onClick={() => {
                    setTab(provider.id);
                    setQuery("");
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    provider.id === current.id
                      ? "bg-state-active text-foreground"
                      : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
                  )}
                >
                  {provider.displayName}
                  {off ? (
                    <span className="text-xs text-muted-foreground">Off</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <SwitchRow
            title={`Use ${current.displayName}`}
            checked={rule.enabled}
            onChange={(enabled) => change((r) => ({ ...r, enabled }))}
          />
          {rule.enabled ? (
            <>
              <SwitchRow
                title="Limit to selected models"
                description={
                  catalog?.status === "ready"
                    ? `${selectedCount} of ${models.length} selected. New models stay hidden until you select them.`
                    : "New models stay hidden until you select them."
                }
                checked={rule.limit}
                disabled={!rule.limit && catalog?.status !== "ready"}
                onChange={(limit) =>
                  change((r) => {
                    if (!limit) return { ...r, limit: false };
                    const kept = r.modelIds.filter((id) => known.has(id));
                    return {
                      ...r,
                      limit: true,
                      modelIds: kept.length
                        ? r.modelIds
                        : models.map((m) => m.model),
                    };
                  })
                }
              />
              {rule.limit ? (
                <ModelChecklist
                  catalog={catalog}
                  providerName={current.displayName}
                  shown={shown}
                  query={query}
                  onQuery={setQuery}
                  selected={selected}
                  selectedCount={selectedCount}
                  total={rule.modelIds.length}
                  unavailable={unavailable}
                  onToggle={(model, on) =>
                    change((r) => ({
                      ...r,
                      modelIds: on
                        ? [...new Set([...r.modelIds, model])]
                        : r.modelIds.filter((id) => id !== model),
                    }))
                  }
                  onRemove={(model) =>
                    change((r) => ({
                      ...r,
                      modelIds: r.modelIds.filter((id) => id !== model),
                    }))
                  }
                />
              ) : catalog?.status === "error" ? (
                <p role="alert" className="px-4 pb-2 text-xs text-destructive">
                  {catalog.message}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </SettingsSection>
  );
}

function ModelChecklist({
  catalog,
  providerName,
  shown,
  query,
  onQuery,
  selected,
  selectedCount,
  total,
  unavailable,
  onToggle,
  onRemove,
}: {
  catalog: CatalogState | undefined;
  providerName: string;
  shown: { model: string; displayName: string }[];
  query: string;
  onQuery: (query: string) => void;
  selected: Set<string>;
  selectedCount: number;
  total: number;
  unavailable: string[];
  onToggle: (model: string, on: boolean) => void;
  onRemove: (model: string) => void;
}) {
  if (!catalog || catalog.status === "loading")
    return (
      <p className="px-4 pb-3 text-sm text-muted-foreground">
        Loading models...
      </p>
    );
  if (catalog.status === "error")
    return (
      <p role="alert" className="px-4 pb-3 text-sm text-destructive">
        Could not load models: {catalog.message}
      </p>
    );
  return (
    <div className="px-4 pb-2.5 pt-1">
      <input
        type="search"
        aria-label={`Search ${providerName} models`}
        placeholder="Search models"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className="mb-2 h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
      />
      <ul
        aria-label={`${providerName} models`}
        className="max-h-72 overflow-y-auto rounded-md border border-border"
      >
        {shown.map((item) => {
          const checked = selected.has(item.model);
          const last = checked && selectedCount <= 1;
          return (
            <li
              key={item.model}
              className="border-b border-border last:border-b-0"
            >
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={last}
                  title={
                    last ? "At least one model must stay selected" : undefined
                  }
                  onChange={(event) =>
                    onToggle(item.model, event.target.checked)
                  }
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 truncate">{item.displayName}</span>
                {item.displayName !== item.model ? (
                  <code className="ml-auto truncate font-mono text-xs text-muted-foreground">
                    {item.model}
                  </code>
                ) : null}
              </label>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="px-2.5 py-3 text-sm text-muted-foreground">
            No models match.
          </li>
        ) : null}
      </ul>
      {unavailable.length ? (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted-foreground">Unavailable</p>
          <ul>
            {unavailable.map((id) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 py-0.5 text-sm"
              >
                <code className="truncate font-mono text-xs text-muted-foreground">
                  {id}
                </code>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  disabled={total <= 1}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
