---
name: profiles
description: Inspect or reset per-project model profiles that control BB's model picker and the default model for new threads.
---

# Profiles

Profiles decide which providers and models show in BB's model picker for each project, and which model a new thread starts on. The Default profile covers every project without a profile of its own. Settings live under Settings -> Plugins -> Profiles; the CLI is read-mostly.

- `bb profiles status [--json]` lists every profile with its projects, provider rules (on or off, limited to N models), default model, and the hidden-models mode. Read it before explaining or changing anything.
- `bb profiles reset [--json]` removes every profile and rule and restores the Default profile with no limits. Run it only when the user explicitly asks to reset everything.

Create, rename, assign and edit profiles in the settings page; they save on their own and reach every connected window.

Limits: profiles change the picker, not model access. CLI/API requests, automations and workflows can still request any model. A thread's current model always stays selectable. A new-thread composer applies the project's default model once, and never overrides a model the user chose in that draft. Picker filtering relies on a version-specific private adapter; if it is inactive the settings page says so and BB's native lists are unchanged.
