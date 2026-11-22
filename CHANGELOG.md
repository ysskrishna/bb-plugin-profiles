# Model Manager changes

## Unreleased

- Rename the plugin to Profiles (package `bb-plugin-profiles`, CLI `bb profiles`).
- Add per-project profiles: Default plus named profiles copied from any profile, each with provider on/off, optional limits to selected models and a default model.
- Show unselected models under More models, or remove them, with one global choice.
- Select a project's default model and reasoning level in new-thread composers without overwriting a model the user picked; add a settings button to the composer.
- Add custom models: add or remove extra model IDs per provider in settings and with `bb profiles models list|add|remove`. They are written to the `customModels` list in BB's config file (atomic, other keys preserved, never overwriting an unparseable file) and BB's config is reloaded.
- Rebuild settings as autosaving cards in the Idle Compact style.
- Convert existing Model Manager rules into Default on first change. Favorites, ordering, the preferred-model button and the favorite/order/prefer CLI commands are removed.
- Target BB 0.50.1 and keep filtering for selected-model discovery queries.
- Document picker-only filtering, native custom-model setup and the private compatibility adapter.
- Retain the upstream SQLite transaction foundation.

## Upstream Model Filter history

# Changelog

## 0.1.0 — 2026-10-26

- Provider-specific model selections in BB's native pickers.
- Current-model exceptions that preserve native model metadata.
- Server-stored preferences with revision checks and connected-client updates.
- One settings checklist per provider with whole-catalog Select all / Deselect all, an enable toggle, and `bb model-filter` CLI.
- Compatibility adapter scoped to BB 0.47.1 and Plugin SDK 0.6.79.

Release candidate prepared for BB Community submission. Distribution uses the Git tag v0.1.0.
