# Profiles

Per-project profiles that control which providers and models show in BB's model picker and the default model new threads start on. No core patch or BB fork.

## Scope

- Default profile plus named profiles; a new profile starts as a copy of any profile. Each project belongs to at most one profile; unassigned projects use Default.
- Per profile and provider: on or off, optional limit to selected models, and one default model (provider, model, reasoning level).
- Global: unselected models are shown under More models (default) or removed from the picker.
- A new-thread composer selects its project's default model on open and when the project changes, unless the user chose a model in that draft. Never a fast service tier.
- Settings save on their own, reach other connected windows without reload, and are opened from a gear button in the new-thread composer.
- One-time conversion of Model Manager rules into Default. Favorites and order are dropped.

## Out of scope

Fallback model; enforcement for CLI, automations and workflows; manual model ordering and favorites; custom model registration; switching the provider of an existing thread.

## Acceptance

1. Settings use shared settings components, have no Apply or Discard, and show Saved after a change.
2. Profiles can be created by copying, renamed and deleted; Default cannot be renamed or deleted; deleting returns projects to Default.
3. A project can belong to only one profile.
4. A provider turned off in a project's profile is absent from that project's provider picker, except for the provider of an existing selection.
5. With a limit on, only selected models are in the main list; the rest are under More models or absent. A thread's current model stays selectable.
6. A new-thread composer applies its project's default and re-applies on project change without overwriting a user's pick.
7. Existing Model Manager rules appear under Default after upgrade.

## Verification

Use the npm commands in README.md and the browser procedure in e2e/README.md. Persistence is tested against real SQLite and picker filtering against real TanStack observers. A live BB installation is not inferred from a passing isolated harness.
