# Manifest name/description i18n — Design (Issue #105 follow-up)

**Date:** 2026-07-19
**Scope:** Extend Spanish i18n coverage (shipped in PR #110) to the two remaining untranslated user-facing strings per game — `manifest.json`'s `name` and `description` — which currently render in English regardless of the active locale.

## Background

The just-shipped Spanish i18n work (design: `2026-07-19-spanish-i18n-design.md`) explicitly scoped `manifest.name`/`manifest.description` as out of scope, treating them as "game-author metadata, not core-engine UI strings" (a pre-existing, documented convention in `docs/TESTING.md`). Reviewing that decision: `manifest.name` actually renders in **6** places (`GameCard`, `FeaturedGameCard`, `QuizGameShell`'s intro screen, `animal-memory-match`'s intro, `KidsProgressPage`, and `AppShell`'s in-game `<h1>` page title) and `manifest.description` in **2** (`GameCard`, `FeaturedGameCard`) — all directly user-facing, including the dashboard tile, which is the first thing any user sees. Under the `es` locale, these currently show untranslated English text (e.g. "Animal Sounds") next to fully-translated Spanish UI, undermining the point of shipping the locale. This work corrects that.

No other manifest field is affected: `icon` (emoji), `color` (hex), `tags` (already resolved through `dashboard.tag.*`, never rendered raw), `version`, `orientation`, and `gameType` all stay as-is — they're not free-text display strings.

Continues on branch `105` (folds into the already-open PR #110 rather than a new branch/PR).

## 1. Manifest schema — `nameKey`/`descriptionKey`

Each of the 6 `src/games/<id>/manifest.json` files replaces its literal `"name"`/`"description"` strings with `"nameKey"`/`"descriptionKey"`, pointing into that game's own i18n namespace — mirroring the existing `nameKey` pattern already used for item catalogs (e.g. `food.apple.nameKey`), which carry no plaintext fallback either.

**Before** (`src/games/animal-sounds/manifest.json`):
```json
{
  "id": "animal-sounds",
  "name": "Animal Sounds",
  "description": "Match the animal to its sound!",
  "icon": "🐘",
  "color": "#B39DDB",
  "version": "1.6.2",
  "tags": ["sounds", "animals"]
}
```

**After:**
```json
{
  "id": "animal-sounds",
  "nameKey": "animalSounds.manifestName",
  "descriptionKey": "animalSounds.manifestDescription",
  "icon": "🐘",
  "color": "#B39DDB",
  "version": "1.6.3",
  "tags": ["sounds", "animals"]
}
```

`manifests` (built once via `import.meta.glob('./games/*/manifest.json', { eager: true })` in `App.jsx`) stays inert data — only render-time code resolves the keys via `t()`. No changes to the auto-discovery mechanism itself.

## 2. i18n content — new keys per game

Each game's `i18n/en.json` and `i18n/es.json` gets two new keys added to its existing top-level namespace:

| Game | New keys |
|---|---|
| `animal-memory-match` | `animalMemoryMatch.manifestName`, `animalMemoryMatch.manifestDescription` |
| `animal-sounds` | `animalSounds.manifestName`, `animalSounds.manifestDescription` |
| `color-match` | `colorMatch.manifestName`, `colorMatch.manifestDescription` |
| `fruit-veggie-id` | `fruitVeggie.manifestName`, `fruitVeggie.manifestDescription` |
| `character-match` | `characterMatch.manifestName`, `characterMatch.manifestDescription` |
| `character-match-bluey` | `characterMatchGameBluey.manifestName`, `characterMatchGameBluey.manifestDescription` |

English values are exactly the current manifest text — a pure move, not a rewrite (e.g. `"manifestName": "Animal Sounds"`, `"manifestDescription": "Match the animal to its sound!"`), so no rendered text changes under the `en` locale. Spanish values are new translations (e.g. `"Sonidos de Animales"` / `"¡Empareja el animal con su sonido!"`), matching the Latin American register established in the prior i18n work.

The existing cross-locale key-parity test (`src/i18n/__tests__/i18n.test.js`, walks `i18n.getResourceBundle(locale, 'translation')` for both locales) automatically covers these 12 new keys with zero test-code changes — that's the main structural payoff of routing through the existing i18n system rather than a bespoke mechanism.

## 3. Component changes

Six components switch from reading `manifest.name`/`manifest.description` directly to resolving via `t()`. All six already call `useTranslation()` for other strings, so each is a one-line swap with no new imports:

| File | Change |
|---|---|
| `src/components/GameCard.jsx` | destructured `name`/`description` → `t(manifest.nameKey)` / `t(manifest.descriptionKey)` |
| `src/components/FeaturedGameCard.jsx` | same; the resolved `name` also feeds `t('dashboard.featuredAriaLabel', { name })` |
| `src/components/QuizGameShell.jsx` | `name={manifest.name}` → `name={t(manifest.nameKey)}` (passed to `GameIntro`) |
| `src/games/animal-memory-match/index.jsx` | same pattern as `QuizGameShell` |
| `src/kids/KidsProgressPage.jsx` | inline `{manifest.name}` → `{t(manifest.nameKey)}` |
| `src/components/AppShell.jsx` | `text: gameManifest.name` → `text: t(gameManifest.nameKey)` in the in-game `<h1>` title resolution |

No new shared abstraction (e.g. a `useManifestText(manifest)` hook) — six direct `t()` call sites is too small to warrant one (YAGNI).

## 4. Versioning

Unlike the pure-content Spanish i18n PR (which touched only i18n JSON, no manifest files, so it bumped only `package.json`), this change edits `manifest.json` itself for all 6 games — a real schema change to each game's manifest contract. Per the project's own versioning convention ("each game's version comes from its own manifest.json"), this bumps:
- Each of the 6 game manifests' `version` (patch bump, e.g. `1.6.2` → `1.6.3`)
- `package.json` (minor bump, following the same precedent as the locale-infrastructure PR)
- A new `CHANGELOG.md` entry

## 5. Docs corrections

- **`docs/TESTING.md:150`** currently states *"Manifest fields (`name`, `description` in `manifest.json`) are NOT translated — they're game-author metadata, not core-engine UI strings."* This is now false and must be corrected to describe the `nameKey`/`descriptionKey` convention, while still noting `icon`/`color`/`tags`/`version`/`orientation`/`gameType` remain untranslated metadata (that part of the claim stays true).
- **`README.md`**: the "Adding a New Game" example manifest (currently showing literal `"name"`/`"description"`) updates to show `"nameKey"`/`"descriptionKey"` plus a one-line instruction to add the matching keys to the game's `i18n/en.json`/`es.json`. The file-tree comment (`# Game metadata (id, name, tags, version, ...)`) updates to say `nameKey`/`descriptionKey` instead of `name`.

## 6. Testing plan

**Existing test fixtures:** Several component tests construct ad-hoc mock manifests with literal `name`/`description` fields for `GameCard`, `AppShell`, `KidsProgressPage`, `FeaturedGameCard`, and `Dashboard` (which renders `GameCard`s). All checked fixtures reuse **real game IDs** (`animal-sounds`, `color-match`) with English text that already matches the real content exactly. Since these tests run against the real i18n singleton (not mocked, per this codebase's established convention), the fix is mechanical: swap each fixture's `name: 'Animal Sounds'` → `nameKey: 'animalSounds.manifestName'` (and same for `description`/`descriptionKey`) — rendered text comes out identical under the default `en` locale, so no assertion text needs to change, only the fixture's field construction. (`AdminPage.test.jsx`/`BadgeGallery.test.jsx` also matched an initial grep for manifest-shaped fixtures but turned out to be unrelated badge/tag objects on inspection — not manifests, no changes needed.) The implementation plan enumerates the exact file list.

**New tests, positive and negative per standing preference:**
- Positive: `GameCard` (exercises both `name` and `description` resolution) and `AppShell` (exercises the in-game `<h1>` title resolution, a different render path than `GameCard`'s) each get one new test confirming they render the *translated* Spanish name/description under the `es` locale, mirroring the `FruitVeggieIdGame` Spanish-locale test pattern from the prior PR (`i18n.changeLanguage('es')` in `beforeEach`, wrapped in `act()`, restored in `afterEach`). The other 4 consumers (`FeaturedGameCard`, `QuizGameShell`, `animal-memory-match/index.jsx`, `KidsProgressPage`) use the identical `t(manifest.nameKey)` pattern already proven by these two — no additional per-component Spanish-locale test for those, avoiding redundant coverage of the same one-line call.
- Negative/consistency: no new negative test needed beyond what the cross-locale parity test already provides — a missing/mismatched key on either locale fails that test directly, covering all 12 new keys automatically.

**e2e/visual:** Storybook stories render under the default `en` locale, and English text is unchanged (pure move, not rewrite), so no visual baseline regen is expected — confirmed with a final `npx playwright test visual.spec.js` pass before merge, same verification discipline as the AdminPage baseline task in the prior PR.

## Out of scope

- Any manifest field other than `name`/`description` (`icon`, `color`, `tags`, `version`, `orientation`, `gameType`).
- A shared `useManifestText()` helper (too small a surface to warrant one).
- Adding a plaintext fallback alongside `nameKey`/`descriptionKey` — consistent with the existing item-`nameKey` precedent, which has none.
- Any new locale beyond Spanish, RTL support, browser-language auto-detection — same exclusions as the parent Spanish i18n spec, still unrelated here.
