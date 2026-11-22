# Profiles

Choose which providers and models appear in BB's model picker for each project, and the default model new threads start on. Settings are shared by every device connected to the same BB server.

Based on [Model Filter](https://github.com/werserk/bb-plugin-model-filter) at `c651107`, retaining its MIT license and transactional preference store. This is a separate plugin; it does not modify BB itself.

## Use

Open Settings -> Plugins -> Profiles, or click the Profiles settings button (sliders icon) in a new-thread composer. Every change saves on its own.

- **Profiles.** Default always exists and covers every project without a profile. Create a profile by copying any profile, then it changes on its own. Assign projects to it; a project belongs to one profile at most. Duplicate, Rename and Delete are in the profile's menu (Default can only be duplicated). Deleting a profile returns its projects to Default.
- **Default model.** Each profile can name one provider, model and reasoning level. Opening a new-thread composer in one of its projects selects it, and switching project selects the new project's default. A model you choose in that draft is not overwritten. The standard service tier is always used.
- **Providers in a profile.** Turn a provider off to remove it from the picker, or limit it to selected models. New models stay hidden until you select them. The last selected model cannot be unchecked. Saved model IDs that BB no longer lists appear under Unavailable and can be removed.
- **Everywhere.** Unselected models are shown under More models, or removed from the picker. Reset everything removes all profiles and rules.

## Known limitations

These are accepted boundaries, not claims that BB enforces a model policy:

1. **Picker filtering only.** CLI/API requests, saved automations, tasks, workflows and other plugins can still request any model. A thread's current model, and the provider it uses, stay selectable even when hidden.
2. **Defaults apply to new-thread composers only.** There is no fallback routing, and existing threads are not switched.
3. **Custom models remain BB configuration.** Register extra model IDs through BB's supported `customModels` configuration; Profiles can then include them.
4. **Version-specific adapter.** Settings, storage, RPC and the composer action use public APIs. Picker filtering also uses a private React/TanStack observer integration, and the settings button navigates by pushing the settings route because BB has no API for that. A future BB change can break either. When query-client discovery fails, the plugin reports inactivity and leaves native lists usable. Do not run it alongside another model-filtering plugin.
5. Independent BB servers do not synchronize profiles.

The compatibility target is **BB 0.50.1 / Plugin SDK 0.6.157**. See [compatibility](docs/compatibility.md).

## CLI

```sh
bb profiles status --json
bb profiles reset
```

`status` lists profiles, their projects, provider rules, default models and the hidden-models mode. `reset` removes every profile and rule. Both accept `--json`. Edit profiles in the settings page.

## Development and installation

```sh
npm ci --ignore-scripts
npm rebuild better-sqlite3 --ignore-scripts=false
npm run check
npm run dev:fixture
```

The fixture is an isolated browser harness with labeled example catalogs and no account or inference calls. Open the URL printed by Vite. It is not a second BB installation and does not compile BB's theme.

After reviewing a build, install from the checkout with `bb plugin install .`. The plugin id is derived from the package name `bb-plugin-profiles`. This repository is not claimed to be published in the BB marketplace.

[Specification](docs/spec.md) | [Architecture](docs/ARCHITECTURE.md) | [Compatibility](docs/compatibility.md) | [Upstream license](LICENSE)
