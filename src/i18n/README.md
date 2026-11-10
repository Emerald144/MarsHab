# English / Myanmar UI text

`LanguageProvider` lives in the root shell above both routes. It starts with English
for server rendering and hydration, then restores `terranexis-language` from browser
storage. Selection updates text in place; it never keys or recreates a mission
provider, map, globe, or animation wrapper. Storage failures leave switching usable.

`translations.ts` uses English source phrases as typed keys with Unicode Myanmar
translations. Use `t(key, values)` for fixed copy and complete interpolated sentences.
Use `display(source)` at the rendering boundary for labels from existing mission
data. Unknown display values fall back to English. Never translate IDs, comparisons,
route keys, API payloads, numbers, coordinates, units, or user-entered mission names.
Official science target names and rover Sol identifiers remain unchanged.

Keep React keys based on the original ID or source value, never translated text.
The language hook causes normal React updates, not remounts. Existing animation
effects do not depend on the translated children.

Myanmar-specific font fallbacks and line spacing are scoped to `html:lang(my)`;
English typography and theme tokens remain intact. Noto Sans Myanmar uses the
existing Google Fonts stylesheet, with Myanmar Text / Padauk / system fallbacks.
If browser storage is unavailable, selection lasts for the current app session.
The standalone server-error page restores Myanmar with a small browser script;
without JavaScript it remains readable in English.

Run `bun run test` for all regressions, including `language.test.tsx`. Review both
languages at narrow widths whenever adding or changing UI copy.
