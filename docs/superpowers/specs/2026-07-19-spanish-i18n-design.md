# Spanish (es) i18n Support — Design (Issue #105)

**Date:** 2026-07-19
**Scope:** Activate the existing (currently dormant) locale-switching infrastructure by shipping a second locale, Spanish, and fixing the one real bug that a second locale exposes.

## Decisions made during brainstorming

- **Locale-switching plumbing is not new.** `src/i18n/index.js` already auto-discovers `*.json` per locale via `import.meta.glob` and derives `SUPPORTED_LOCALES` from what's actually found; `AdminPage` already renders a `LocaleSelector` wired to `settings.locale`; `App.jsx` already calls `i18n.changeLanguage(settings.locale)` and syncs `document.documentElement.lang`. None of this needs to change — it has simply never had a second locale to activate it (`SUPPORTED_LOCALES` today is `['en']`, and `LocaleSelector` early-returns `null` when `locales.length < 2`).
- **Spanish variant: Latin American / US Spanish.** Locale code is `es` (bare, matching the existing bare `en` — not `es-419`/`es-ES`/`es-US`). Vocabulary choices favor broadly-understood Latin American terms over Peninsular Spanish (e.g. "jugo" not "zumo").
- **Character proper names are not translated.** `character-match` and `character-match-bluey`'s item catalogs are licensed-show character names (Bluey, Bingo, Gil, Molly, …). Only their `prompt`/`howToPlay` strings are translated; the name catalog stays byte-identical to `en.json`.
- **Manifest `name`/`description` stay untranslated**, everywhere — this is a pre-existing, documented convention (`docs/TESTING.md`: "Manifest fields … are NOT translated — they're game-author metadata, not core-engine UI strings"), not a new decision for this work.
- **Friendly language names in the picker, in addition to the original ask.** `LocaleSelector` currently renders raw locale codes as option text. Since adding `es.json` makes the picker visible for the first time, this is the right moment to add a small display-name map rather than ship a user-facing "en"/"es" dropdown.
- **Speech-synthesis language bug is in scope.** `useSpeech.js` hardcodes `utterance.lang = 'en-US'`. `fruit-veggie-id` is the only consumer and calls `speak(t(food.correct.nameKey))` — under the Spanish locale this speaks Spanish text with a forced English voice, which is a real correctness bug the moment `es.json` exists, not a hypothetical.
- **Versioning: `package.json` only, minor bump.** Matches the precedent set when the locale-switching infrastructure itself shipped (v0.12.0, a minor bump) and the precedent that cross-cutting/engine-level changes bump only the app version, not individual game manifests (the accessibility-wave-1 commit touched only `CHANGELOG.md`/`docs/ENHANCEMENTS.md`/`package.json`). This is core i18n content, not a per-game feature — no game manifest version bumps.
- **Out of scope:** full RTL support (unrelated — Spanish is LTR; already a separate backlog item in `docs/ENHANCEMENTS.md`), browser-language auto-detection (locale stays a manual `settings.locale` choice, unchanged default `'en'`), translating any locale beyond Spanish.

## 1. Core translations — `src/i18n/es.json`

New file, structurally identical to `src/i18n/en.json`: same top-level namespaces (`common`, `shell`, `dashboard`, `parent`, `gameCard`, `admin`, `scoreHistory`, `kids`, `badges`, `memoryBoard`), same key names, same `{{interpolation}}` placeholders, same `_one`/`_other` plural-suffixed keys (Spanish uses the same CLDR one/other plural categories as English, so `difficultyOfferHeading_one`/`_other` need no structural change — just translated wording, e.g. `_one`: "¡Sesión perfecta! ¿Intentas {{count}} opción la próxima vez?", `_other`: "... {{count}} opciones ...").

`admin.localeHeading` ("Language" → "Idioma") is the string the now-visible picker's `<h2>` uses.

## 2. Per-game translations — `src/games/<id>/i18n/es.json`

One new file per existing game folder (6 total), each mirroring that game's `en.json` structure:

| Game | UI strings | Item-name catalog |
|---|---|---|
| `animal-memory-match` | translated | translated (common animal nouns: Dog→Perro, Cat→Gato, Cow→Vaca, Duck→Pato, Frog→Rana, Lion→León) + its own `badges.*` catalog translated |
| `animal-sounds` | translated | translated (Elephant→Elefante, Lion→León, Cow→Vaca, Dog→Perro, Cat→Gato, Frog→Rana, Duck→Pato, Horse→Caballo, Pig→Cerdo, Sheep→Oveja, Rooster→Gallo, Owl→Búho) |
| `color-match` | translated | translated (Red→Rojo, Orange→Naranja, Yellow→Amarillo, Green→Verde, Blue→Azul, Purple→Morado, Pink→Rosado, Brown→Marrón, Black→Negro, White→Blanco, Gray→Gris) |
| `fruit-veggie-id` | translated | translated (Apple→Manzana, Banana→Banana [same word — valid, widely-used Spanish spelling, not an oversight], Orange→Naranja, Strawberry→Fresa, Grapes→Uvas, Watermelon→Sandía, Carrot→Zanahoria, Tomato→Tomate, Corn→Maíz, Broccoli→Brócoli, Potato→Papa, Pepper→Pimiento) |
| `character-match` | translated | **unchanged** (character proper names) |
| `character-match-bluey` | translated | **unchanged** (character proper names) |

`mergeLocaleResources`/`groupModulesByLocale`/`buildResources` (`src/i18n/index.js`) are already locale-agnostic — confirmed by their existing tests, which already exercise multi-locale merging (`en`/`es`/`fr` fixtures). No code changes needed there.

## 3. Bug fix — `src/hooks/useSpeech.js`

**Before:**
```js
const speak = useCallback(text => {
  const s = synthRef.current
  if (!s || !Utterance || !text) return
  s.cancel()
  const utterance = new Utterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.9
  s.speak(utterance)
}, [Utterance])
```

**After:** derive the utterance's `lang` from the active i18next locale via a small internal map, defaulting to `en-US` for anything unmapped:
```js
const SPEECH_LANG_BY_LOCALE = { en: 'en-US', es: 'es-US' }

// inside the hook
const { i18n } = useTranslation()
...
const speak = useCallback(text => {
  const s = synthRef.current
  if (!s || !Utterance || !text) return
  s.cancel()
  const utterance = new Utterance(text)
  utterance.lang = SPEECH_LANG_BY_LOCALE[i18n.language] ?? 'en-US'
  utterance.rate = 0.9
  s.speak(utterance)
}, [Utterance, i18n.language])
```
`useTranslation()` is already the standard way other components (e.g. `ScoreHistory`) read the active locale reactively; using it here keeps `useSpeech` consistent with that pattern instead of importing the `i18n` singleton directly.

## 4. `LocaleSelector.jsx` — friendly language names

**Before:** `<option key={loc} value={loc}>{loc}</option>`

**After:** a small display-name map with a same-graceful-degradation fallback to the raw code, so a future locale added before the map is updated doesn't break, just shows its code:
```js
const LOCALE_NAMES = { en: 'English', es: 'Español' }
...
<option key={loc} value={loc}>{LOCALE_NAMES[loc] ?? loc}</option>
```

## Testing plan

Positive and negative cases at each layer, per standing preference.

**`src/i18n/__tests__/i18n.test.js`:**
- Positive: `SUPPORTED_LOCALES` now equals `['en', 'es']` (update existing assertion).
- Positive: a known `es` key resolves correctly (e.g. `i18n.t('common.home', { lng: 'es' })` → `'Inicio'`).
- Negative/consistency: a new test walks the real `en.json`/`es.json` trees (core + all 6 game files) and asserts identical key sets in both directions — catches a key present in one locale but missing (or misspelled) in the other. This is the test that keeps the two content sets honest as either file evolves later, not just a one-time check.

**`src/hooks/__tests__/useSpeech.test.js`** (needs a `<I18nextProvider>`/`i18n.changeLanguage` wrapper since `speak` now reads `useTranslation()`):
- Positive: `speak()` sets `lang: 'en-US'` when the active locale is `en` (existing test, unchanged expectation).
- Positive: `speak()` sets `lang: 'es-US'` when the active locale is `es`.
- Negative: an unmapped/hypothetical locale falls back to `en-US` rather than leaving `lang` unset.
- Positive: every code in `SUPPORTED_LOCALES` has an entry in `SPEECH_LANG_BY_LOCALE` (fails loudly if a 3rd locale is ever added without updating the speech map).

**`src/components/__tests__/LocaleSelector.test.jsx`:**
- Positive: known codes (`en`, `es`) render their friendly names ("English", "Español").
- Negative: an unmapped code renders the raw code, not `undefined`/blank.

**`src/App.test.jsx`:**
- Positive: `settings.locale = 'es'` drives `i18n.changeLanguage('es')` and `document.documentElement.lang === 'es'`.
- Existing negative case (unset/already-current locale doesn't call `changeLanguage` redundantly) continues to pass unchanged.

**`src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`:**
- Positive: under the `es` locale, the replay button triggers `speak()` with the Spanish item name.

**e2e:** the `pages-adminpage--default` visual-regression baseline (`e2e/visual.spec.js`) must be regenerated — `SUPPORTED_LOCALES.length` is no longer `1`, so the Settings page now renders the previously-hidden Language section, which is an intentional layout change, not a regression.

## Docs

- `README.md`: add a `locale` row to the Settings Reference table (default `'en'`, options = whatever `SUPPORTED_LOCALES` discovers — currently `en`/`es`); note in the i18n section that `es.json` now exists alongside `en.json` per namespace.
- `docs/TESTING.md`: extend the i18n string convention note to mention the cross-locale key-parity test.
- `CHANGELOG.md`: new `### Added` entry, issue #105, under a new `0.29.0` version (minor bump — see versioning decision above).
- `docs/ENHANCEMENTS.md`: no change needed (Spanish i18n was not a tracked backlog item there; the existing RTL bullet is unrelated and stays).
