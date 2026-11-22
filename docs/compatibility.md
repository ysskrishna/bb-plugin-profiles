# Compatibility and known issues

Target: BB 0.50.1, Plugin SDK 0.6.157. The manifest bounds BB support to 0.50.x. This range is a compatibility guard, not evidence every patch/platform has been tested.

## Private and unsupported surfaces

- Picker filtering finds BB's TanStack query client through React fibers and wraps its default query options. It matches `systemExecutionOptions` keys of five or six parts: `[name, environmentId, hostId, providerId, projectId, selectedModel?]`. The project slot is usually null, so the project is taken from the environment id or the new-thread composer instead.
- The remove mode relies on array-method overrides on `selectedOnlyModels` surviving TanStack's structural sharing.
- BB has no API for editing `customModels`. Profiles reads and atomically rewrites the top-level `customModels` array in `<dataDir>/config.json` (the directory comes from `bb.server.experimental_dataDir`) and then calls `bb.sdk.system.reloadConfig()`. If the reload fails the file stays saved and the UI shows a warning. BB skips invalid entries; entries Profiles cannot interpret are left untouched.
- BB has no API for opening a plugin's settings from a composer. The settings button pushes `/settings/plugins/profiles?tab=settings` and dispatches `popstate`.

Discovery failure restores native choices and the settings page reports it. Do not stack Profiles with other model-filtering adapters.

## Accepted limitations

Picker filtering can be bypassed by explicit CLI/API and other plugin requests. Current model selections remain usable. Defaults apply to new-thread composers only. Custom models are global (not per profile) and an ACP agent may reject an unlisted ID when a thread starts. Fallback routing is out of scope.

## Verification boundaries

Automated: profile logic, v1 conversion, projection, composer defaults, the settings page flows, server and CLI against a real migrated SQLite database, and the bridge against real TanStack observers. The isolated browser fixture does not compile BB's theme.

Not verified by this repository's checks: the installed BB 0.50.1 frontend, the native More models submenu, the settings button navigation, physical mobile devices, Electron shell behavior, and other BB versions. Do not widen support from a passing fixture.
