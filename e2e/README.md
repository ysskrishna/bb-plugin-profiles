# Isolated browser fixture

Run `npm run dev:fixture` and open the printed URL. The page imports the real plugin app, settings page and composer action and the real TanStack query client and observers; only BB SDK and account data are emulated (profiles are kept in memory). Example catalogs are labeled, and no vendor process, live BB settings or inference call is used.

The fixture does not compile BB's Tailwind theme, so the settings page appears unstyled here. Check its appearance in BB itself.

Check:

1. Create a profile by copying Default, assign `aribills` to it, limit a provider to a few models, and set a default model. The fixture composer (project `aribills`) selects that default.
2. The native picker fixture lists only the selected models in the main list; in Remove mode (Everywhere, Hidden models) the unselected ones are gone.
3. Pick another model in the composer fixture, then change the profile default. The pick is not overwritten.
4. Unload plugin. The native picker restores the full catalog. Load again; the profiles return.

The actual BB native picker and physical mobile or Electron acceptance remain a separate post-installation check. This fixture is not a full live BB integration test.
