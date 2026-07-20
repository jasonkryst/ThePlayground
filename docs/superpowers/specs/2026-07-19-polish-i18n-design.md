# Polish (pl) i18n Support — Design (Issue #107)

**Date:** 2026-07-19
**Scope:** Activate the existing locale-switching infrastructure for a third locale, Polish, building on the same pattern as Spanish (issue #105, merged v0.29.0/v0.30.0).

## Decisions made during brainstorming

- **No new plumbing needed.** `src/i18n/index.js` already auto-discovers `*.json` per locale via `import.meta.glob` and derives `SUPPORTED_LOCALES` from what's actually found; `LocaleSelector` already renders once `locales.length >= 2` (already true today, with `en`/`es`); `App.jsx` already calls `i18n.changeLanguage(settings.locale)` and syncs `document.documentElement.lang`. Adding `pl.json` files is the only structural change needed for the app to pick up the third locale.
- **Locale code: `pl` (bare)**, matching the existing bare `en`/`es` — Polish has no regional-variant ambiguity to resolve (unlike Spanish's LatAm-vs-Spain choice).
- **Register: informal imperative**, matching the informal `tú`-style register Spanish used (e.g. `es` "¡Encuentra los pares!" → `pl` "Znajdź pary!") — appropriate for a toddler-facing app, not a new decision so much as consistency with the existing precedent.
- **Plural handling: full CLDR forms, not the `en`/`es` two-category pattern.** Polish cardinal plurals have four categories — `one` (n=1), `few` (n%10∈2..4 and n%100∉12..14), `many` (everything else integer — 0, 5-9, 11-14, ...), `other` (non-integers, unreachable for the integer counts this app uses, included defensively anyway). Both pluralized keys (`common.difficultyOfferHeading`, `gameCard.playCount`) get `_one`/`_few`/`_many`/`_other` suffixes in `pl.json`. i18next's default pluralization resolver (v26, `Intl.PluralRules`-backed) picks the right suffix per locale automatically — no change to `i18next.init()` config.
- **Character proper names are not translated.** Same convention as Spanish: `character-match` and `character-match-bluey`'s item catalogs (Bluey, Bingo, Gil, Molly, …) keep their `en.json`-identical names; only `prompt`/`howToPlay` strings are translated.
- **Manifest `name`/`description` ARE translated.** Correction from an earlier draft of this spec: the original Spanish rollout left these untranslated, but a same-day follow-up under #105 (`docs/TESTING.md:150`) reversed that — every `manifest.json` now carries `nameKey`/`descriptionKey` pointing at `<gameNamespace>.manifestName`/`.manifestDescription` in that game's own i18n file, and the current `es.json` files already translate them (e.g. `animalMemoryMatch.manifestName` → "Memorama de Animales"). Each `pl.json` must translate these two keys per game, same as every other UI string. Other manifest fields (`icon`, `color`, `tags`, `version`, `orientation`, `gameType`) remain untranslated metadata, unchanged.
- **No new bug to fix.** Unlike the Spanish rollout (which was the *first* second locale, and so exposed `useSpeech.js`'s hardcoded `en-US` and `LocaleSelector`'s raw-code display for the first time), the generic mechanisms built during that work are locale-agnostic already: `SPEECH_LANG_BY_LOCALE` and `LOCALE_NAMES` are maps that just need a `pl` entry each. Date formatting (`dateRangeUtils.js`, `ScoreHistory.jsx`) already derives from `Intl.DateTimeFormat(locale, ...)` driven by the active i18next locale, not hardcoded — Polish date formatting works with no code change.
- **No visual-regression baseline change needed.** The Spanish rollout regenerated the `pages-adminpage--default` baseline because going from 1→2 locales made `LocaleSelector` render for the first time (a real, first-time layout change — it previously returned `null`). Going 2→3 only adds a third `<option>` inside an already-visible, already-collapsed `<select>`; nothing new is revealed in the collapsed state.
- **Versioning: `package.json` only, minor bump (0.30.0 → 0.31.0).** Matches the precedent: core i18n content is a cross-cutting/engine-level change, not a per-game feature — no game manifest version bumps.
- **Out of scope:** RTL support (unrelated — Polish is LTR), browser-language auto-detection (locale stays a manual `settings.locale` choice), translating any locale beyond Polish.

## 1. Core translations — `src/i18n/pl.json`

New file, structurally identical to `src/i18n/en.json`: same top-level namespaces (`common`, `shell`, `dashboard`, `parent`, `gameCard`, `admin`, `scoreHistory`, `kids`, `badges`, `memoryBoard`), same key names, same `{{interpolation}}` placeholders.

Both pluralized keys get all four CLDR forms, e.g.:
```json
"difficultyOfferHeading_one": "Świetna sesja! Spróbować {{count}} opcji następnym razem?",
"difficultyOfferHeading_few": "Świetna sesja! Spróbować {{count}} opcji następnym razem?",
"difficultyOfferHeading_many": "Świetna sesja! Spróbować {{count}} opcji następnym razem?",
"difficultyOfferHeading_other": "Świetna sesja! Spróbować {{count}} opcji następnym razem?",
"playCount_one": "{{count}} gra",
"playCount_few": "{{count}} gry",
"playCount_many": "{{count}} gier",
"playCount_other": "{{count}} gry"
```
(Exact wording finalized during implementation — `opcji`/`opcja`/`opcje` may vary by count per Polish noun declension; the implementer should verify each form is grammatically correct for its category, not just structurally present.)

`admin.localeHeading` ("Language" → "Język") is the string the picker's `<h2>` uses.

## 2. Per-game translations — `src/games/<id>/i18n/pl.json`

One new file per existing game folder (6 total), each mirroring that game's `en.json` structure:

| Game | UI strings | Item-name catalog |
|---|---|---|
| `animal-memory-match` | translated | translated (Dog→Pies, Cat→Kot, Cow→Krowa, Duck→Kaczka, Frog→Żaba, Lion→Lew) + its own `badges.*` catalog translated |
| `animal-sounds` | translated | translated (Elephant→Słoń, Lion→Lew, Cow→Krowa, Dog→Pies, Cat→Kot, Frog→Żaba, Duck→Kaczka, Horse→Koń, Pig→Świnia, Sheep→Owca, Rooster→Kogut, Owl→Sowa) |
| `color-match` | translated | translated (Red→Czerwony, Orange→Pomarańczowy, Yellow→Żółty, Green→Zielony, Blue→Niebieski, Purple→Fioletowy, Pink→Różowy, Brown→Brązowy, Black→Czarny, White→Biały, Gray→Szary) |
| `fruit-veggie-id` | translated | translated (Apple→Jabłko, Banana→Banan, Orange→Pomarańcza, Strawberry→Truskawka, Grapes→Winogrona, Watermelon→Arbuz, Carrot→Marchewka, Tomato→Pomidor, Corn→Kukurydza, Broccoli→Brokuł, Potato→Ziemniak, Pepper→Papryka) |
| `character-match` | translated | **unchanged** (character proper names) |
| `character-match-bluey` | translated | **unchanged** (character proper names) |

`mergeLocaleResources`/`groupModulesByLocale`/`buildResources` (`src/i18n/index.js`) are already locale-agnostic and already tested with multi-locale fixtures — no code changes needed there.

## 3. Code changes

**`src/hooks/useSpeech.js`** — add one map entry:
```js
export const SPEECH_LANG_BY_LOCALE = { en: 'en-US', es: 'es-US', pl: 'pl-PL' }
```

**`src/components/LocaleSelector.jsx`** — add one map entry:
```js
const LOCALE_NAMES = { en: 'English', es: 'Español', pl: 'Polski' }
```

No other source changes required.

## 4. Testing plan

Positive and negative cases at each layer, per standing preference.

**`src/i18n/__tests__/i18n.test.js`:**
- Positive: `SUPPORTED_LOCALES` now equals `['en', 'es', 'pl']`.
- Positive: a known `pl` key resolves correctly (e.g. `i18n.t('common.home', { lng: 'pl' })` → the Polish string).
- Positive: `i18n.t('common.difficultyOfferHeading', { count: 1, lng: 'pl' })`, `{ count: 3, lng: 'pl' }`, and `{ count: 5, lng: 'pl' }` each resolve to the correct `one`/`few`/`many` Polish form.
- Negative: the existing en/es-only `difficultyOfferHeading` singular/plural test continues to pass unchanged (two-category behavior for `en` is not disturbed by `pl` having four).
- **Parity test rewrite** (replaces the old exact-key-set assertion, since it no longer holds once `pl` has extra plural suffixes): strip known plural suffixes (`_one`/`_few`/`_many`/`_other`) from leaf paths to get each locale's base-key set; assert `en`, `es`, and `pl` base-key sets are identical across core + every game (still catches a genuinely missing/misspelled key). Separately, for each of the two pluralizable base keys, assert `en`/`es` define exactly `{one, other}` and `pl` defines exactly `{one, few, many, other}` — catches an incomplete Polish plural set or an accidentally-added stray suffix.

**`src/hooks/__tests__/useSpeech.test.js`:**
- Positive: `speak()` sets `lang: 'pl-PL'` when the active locale is `pl`.
- Existing positive (`en`→`en-US`, `es`→`es-US`) and negative (unmapped locale → `en-US` fallback) cases continue to pass unchanged.
- Positive (updated): every code in `SUPPORTED_LOCALES` has an entry in `SPEECH_LANG_BY_LOCALE` — this test already exists from the Spanish work and now also enforces `pl`'s presence without modification.

**`src/components/__tests__/LocaleSelector.test.jsx`:**
- Positive: `locales={['en','es','pl']}` renders 3 options with friendly names `['English', 'Español', 'Polski']`.
- Existing negative (unmapped code `fr` renders raw code) continues to pass unchanged.

**`src/App.test.jsx`:**
- Positive: `settings.locale = 'pl'` drives `i18n.changeLanguage('pl')` and `document.documentElement.lang === 'pl'`.

**`src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`:**
- Positive: under the `pl` locale, the replay button triggers `speak()` with the Polish item name.

**e2e:** no visual-regression baseline changes expected (see decisions above) — confirm by running `npm run e2e` and checking the AdminPage snapshot diff is empty, not by pre-emptively regenerating it.

## Docs

- `README.md`: settings-reference table row → `Language | English | English, Español, Polski`; tree-listing comments add a `pl.json` line next to each existing `es.json` line; step-4 game-authoring note mentions `pl.json` alongside `es.json`.
- `docs/TESTING.md`: update the cross-locale parity note to describe the base-key-plus-per-locale-plural-completeness check (replacing the "exact same set of leaf key paths" description, which is no longer accurate).
- `CHANGELOG.md`: new `### Added` entry, issue #107, under a new `0.31.0` version (minor bump).
- `docs/ENHANCEMENTS.md`: no change needed (Polish i18n was not a tracked backlog item there).
