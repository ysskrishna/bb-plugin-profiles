## Per-project model profiles

Choose which providers and models appear in BB's model picker for each project, and the default model new threads start on. Make a profile by copying another, assign projects to it, switch providers on or off, and limit a provider to the models you select. Projects without a profile use Default.

Unselected models stay reachable under More models, or can be removed from the picker entirely. A new-thread composer selects its project's default model and reasoning level until you pick another. Settings save on their own and reach every window connected to the BB server. A gear button in the new-thread composer opens them.

## Requirements and limits

Targets BB 0.50.1 and Plugin SDK 0.6.157. Based on the MIT-licensed Model Filter plugin. No separate account, credential, service, or inference call is added.

Profiles change the picker, not model access: CLI/API, automation and workflow requests can still use any model, and a thread's current model always stays selectable. There is no fallback routing. Picker filtering uses a version-specific private React/TanStack adapter; an incompatible client keeps its native lists and the settings page reports it. Disable other model-filtering plugins before use.
