# Architecture

Profiles extends Model Filter at c651107. LICENSE retains the upstream MIT notice. The private adapter is reused deliberately for the approved plugin-only scope; this is not described as a supported BB extension point.

| Module                | Responsibility                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| profiles.ts           | Types, bounded validation, profile operations, project resolution, v1 conversion and the pure picker projection             |
| profiles-store.ts     | SQLite singleton row (`model_filter_preferences`), version 2 document, immediate-transaction mutations                      |
| contract.ts           | Strict RPC inputs and the `profiles-changed` realtime channel                                                               |
| server.ts             | RPC handlers, refusals for invalid changes, `bb profiles` CLI                                                               |
| query-bridge.ts       | Sole private React/TanStack boundary; five/six-field query keys, composed observer selectors, unchanged raw cache, disposal |
| profiles-client.ts    | Client snapshot, runtime status, environment-to-project map and the new-thread composer's project                           |
| composer-default.ts   | Pure rules for when a composer draft gets its profile's default model                                                       |
| ComposerProfile.tsx   | New-thread composer action: publishes the project, applies defaults, settings button                                        |
| app.tsx               | Overlay lifecycle, realtime and reconnect reads, environment map, composer and settings registration                        |
| SettingsPage.tsx etc. | Settings page (ProfilesSection, ProvidersSection), built from settings-ui.tsx; data hooks in settings-data.ts               |
| e2e/                  | Isolated browser fixture; no live BB account calls                                                                          |

The stored document is `{version: 2, snapshot: {revision, hiddenModels, profiles}}`. A version 1 document is converted when read and rewritten as version 2 on the next change. Each change runs on the latest stored snapshot inside one immediate transaction and bumps the revision; there is no client revision check, so concurrent edits are last-write-wins per operation. `profiles[0]` is always Default.

A picker's project comes from the model-list query key's environment id, mapped through `sdk.environments.list`, else from the mounted new-thread composer's project, else Default. The query key's own project slot is not used. A provider that a profile turns off is removed from a list unless it is the provider the list was requested for. Limited providers show selected models in the main list; unselected ones go to `selectedOnlyModels` (BB's More models submenu) or, in remove mode, behind a facade that keeps the current model findable. If none of the selected ids exist in the catalog the catalog is returned unchanged.

The private boundary remains version-scoped. Neither the SDK import scanner nor mocked host tests prove future BB compatibility.
