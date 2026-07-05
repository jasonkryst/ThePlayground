# Accessibility & i18n Hardening

Date: 2026-07-05
Status: Approved

## Context

The app already has non-trivial i18n and a11y infrastructure: every UI string flows through `react-i18next` and `src/i18n/en.json`, data items use a `nameKey` indirection so games never hardcode display names, `jest-axe` runs on every component/game test, and `@axe-core/playwright` scans every E2E page (see `docs/TESTING.md`). This phase is not "add i18n/a11y from scratch" — it's closing the gaps that automated tooling and the existing convention don't catch, found by a manual read-through of every game, shared component, and page (`Dashboard`, `AdminPage`, `ParentDashboard`, `KidsProgressPage`, all three games, `GameChoiceGrid`, `GameResults`, `GameIntro`, `Timer`, `StreakBadge`, `BadgeGallery`, `ScoreHistory`, `GameCard`, `FeaturedGameCard`, `ManifestIcon`, `CategorySection`, `index.css` and every component-level stylesheet).

Scope decisions made during design:
- **i18n:** infrastructure only — no second language is being translated in this phase. The goal is that dropping in a language file later is the only remaining step.
- **WCAG:** target 2.2 AA. Fix the concrete gaps found below, plus the same categories of issue if they turn up elsewhere while implementing. Toddler-specific hardening beyond AA (larger touch targets, redesigning the audio-only prompt in Animal Sounds for deaf/HoH players) is explicitly out of scope for this phase.
- RTL layout readiness is noted but deferred (see "Out of scope").

## i18n: per-game locale files

**Problem:** `CLAUDE.md`'s core architectural promise is that dropping a folder into `src/games/<id>/` with a `manifest.json` and `index.jsx` is sufficient for a game to appear and work — no registry, no shared file to edit. i18n strings are the one exception: adding a game today means hand-editing the shared `src/i18n/en.json`. That's a portability gap against the codebase's own stated architecture.

**Change:**
- Each game gains `src/games/<id>/i18n/en.json` holding only that game's namespace: its `prompt`/`howToPlay` strings and its item-name catalog (e.g. `src/games/character-match/i18n/en.json` holds `characterMatch.*` and `character.*`; `src/games/animal-sounds/i18n/en.json` holds `animalSounds.*` and `animal.*`; `src/games/color-match/i18n/en.json` holds `colorMatch.*` and `color.*`).
- `src/i18n/en.json` keeps only cross-cutting UI strings not owned by any single game: `common`, `dashboard`, `admin`, `parent`, `kids`, `scoreHistory`, `badges`.
- `src/i18n/index.js` changes from a static `import en from './en.json'` to:
  ```js
  const coreResources = en // from src/i18n/en.json
  const gameModules = import.meta.glob('../games/*/i18n/en.json', { eager: true })
  const merged = Object.values(gameModules).reduce(
    (acc, m) => ({ ...acc, ...(m.default ?? m) }),
    coreResources
  )
  i18n.use(initReactI18next).init({ resources: { en: { translation: merged } }, ... })
  ```
  This mirrors the existing `App.jsx` manifest/component auto-discovery pattern (`import.meta.glob('./games/*/manifest.json', { eager: true })`) rather than introducing a new convention.
- **No consumer changes required.** `ParentDashboard.jsx`'s `MissedItemsPanel` resolves `` t(`${ns}.${itemId}.name`) `` for `ns` in `{'animal-sounds': 'animal', 'color-match': 'color'}` — since merging happens before `i18n.init()`, `t('animal.elephant.name')` resolves identically whether that key physically lives in the core file or in `games/animal-sounds/i18n/en.json`.
- **Collision safety:** extend the existing `src/i18n/__tests__/i18n.test.js` with a test that asserts no top-level key present in more than one source file (core + each game), failing loudly if two games (or a game and the core file) pick the same namespace.

## i18n: cleanup and scaffolding

- **Dynamic `<html lang>`:** `index.html` keeps a static `lang="en"` as the initial-paint fallback, but `src/i18n/index.js` registers `i18n.on('languageChanged', lng => { document.documentElement.lang = lng })` and sets it once on init, so the attribute always reflects the active language once i18next has resolved.
- **`settings.locale` setting:** add `locale: 'en'` to `DEFAULT_SETTINGS` in `src/storage/adapter.js`. On settings load, `i18n.changeLanguage(settings.locale)` is called (in `useSettings` or an app-level effect). A language selector renders in `AdminPage`'s Settings tab **only when 2+ locales are registered in the merged resource bundle** — with one locale today, no dropdown is shown, avoiding a single-option control that does nothing.
- **Extract hardcoded strings that bypass `t()`:**
  - `src/admin/AdminPage.jsx:402` — `<p className="admin__hint">No games found.</p>` → new key `admin.noGamesFound`.
  - `src/parent/ParentDashboard.jsx:226` — `` aria-label={`${gameId} missed items`} `` → new key `parent.missedItemsAriaLabel` with `{{name}}` interpolation, using the game's real display name (see next point) instead of the raw id.
  - `src/parent/ParentDashboard.jsx` renders raw `gameId` as visible text in two places: `MissedItemsPanel`'s `<h3>{gameId}</h3>` and `StreakHistoryPanel`'s `<td>{gameId}</td>`. Both need the game's actual manifest name, not its slug — `ParentDashboard` already doesn't receive `manifests` as a prop today, so it needs one added (`App.jsx` passes `manifests` the same way it already does to `Dashboard`/`AdminPage`/`KidsProgressPage`), then a `gameId → manifest.name` lookup used in both places.
  - `src/components/Dashboard.jsx`'s `buildSections()` (tab/section headings) and `AdminPage`'s game-tags tab both render raw tag slugs (`sounds`, `animals`, etc.) capitalized but untranslated. Add a `dashboard.tag.<slug>` key per existing tag (`sounds`, `visual`, `numbers`, `animals`, `colors`, `characters`) and fall back to the capitalized slug via i18next's `defaultValue` for any tag that isn't in the catalog (tags are user-editable free text via Admin's tag override field, so an escape hatch is required — not every possible tag can have a translation).

## WCAG 2.2 AA: concrete fixes

- **Focus-visible on gameplay controls.** The codebase already has a consistent pattern — `X:focus { outline: none }` paired with `X:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px }` — applied to `.dashboard__nav-link`, `.dashboard__tab`, `.game-card`, `.featured-card`, `.admin__back`, `.admin__tab`, `.parent__back`, `.kid-progress__back`. It is **missing** from every actual gameplay/action button: `.game__choice` (the answer buttons — the single most-clicked element in the app), `.game__next`, `.game__replay`, `.game-intro__start`, `.results__btn`, and every Admin control button (`.admin__toggle-btn`, `.admin__tag-save`, `.admin__tag-reset`, `.admin__intro-replay`, `.admin__reset`). Extend the existing pattern to all of them rather than inventing a new style.
- **Focus management on view transitions.** Neither game-phase changes (`showIntro` → playing → `done`) nor route navigations (`BrowserRouter` push) move focus. A keyboard/screen-reader user who finishes a game is never told a new view rendered. Fix: on mount of `GameIntro`, `GameResults`, and each top-level page (`Dashboard`, `AdminPage`, `ParentDashboard`, `KidsProgressPage`), move focus to that view's heading (`tabIndex={-1}` + `.focus()` in a `useEffect`, the standard SPA pattern for this problem). This also **removes the need for `aria-live` regions** on `GameResults`' score/personal-best/badge content — once focus lands on the results heading, a screen reader reads everything below it in document order for free.
- **`aria-live="polite"` on `StreakBadge` only.** It's a genuine transient in-place update (appears/disappears mid-game without a full view change) worth announcing. `Timer` deliberately gets no `aria-live` — announcing every tick would be disruptive — that's correct as-is and isn't being changed.
- **`prefers-reduced-motion` guard.** `src/index.css`'s `pulse-green`/`shake-red` keyframe animations (used for correct/wrong feedback) currently always animate. Wrap the animation declarations in `@media (prefers-reduced-motion: no-preference)` and provide a non-animated fallback (the existing `background` color change, without the `transform`/`box-shadow` motion) for users who've set the OS-level reduce-motion preference.
- **Contrast on disabled-wrong choices.** `.game__choice--disabled-wrong { opacity: 0.45; filter: grayscale(60%); }` (`src/index.css:59`) stacks on top of `ColorMatchGame`'s per-choice `textColor` (already chosen for contrast against its swatch), likely dropping the label below AA's 4.5:1 text contrast once faded. Replace the opacity-based fade with a fixed muted treatment (e.g. a solid reduced-saturation background token) that keeps computed contrast above threshold — verified with a contrast checker during implementation, not assumed.
- **Chart accessibility.** `ParentDashboard`'s `ScoreTrendChart` and `ResponseTimeChart` (recharts SVG `LineChart`) have no text equivalent — a screen reader gets nothing meaningful from the SVG. Add a visually-hidden `<table>` fallback for each, following the same visible-table pattern already used by `StreakHistoryPanel`. While touching this, fix `Legend`/`Line name` props, which currently render the raw `gameId` instead of the game's translated display name (same manifest-name lookup as the ParentDashboard fix above).
- **General pass.** The items above are the concrete instances found by reading every file; the same four categories (focus-visible, focus management, motion, contrast/live-region) are likely to recur in one or two spots not explicitly enumerated here — fix them the same way if found during implementation, rather than treating this list as exhaustive.

## Out of scope (this phase)

- Translating any string into a second language — only the mechanism to do so.
- RTL layout support (logical CSS properties, `dir` attribute sync) — no RTL language is planned; revisit if/when one is.
- Larger-than-AA touch targets and redesigning Animal Sounds' audio-only prompt for deaf/hard-of-hearing players — deliberately excluded per the WCAG-scope decision above.

## Testing

Per `docs/TESTING.md`'s existing four layers:

- **Unit (Vitest):** extend `src/i18n/__tests__/i18n.test.js` with the key-collision check across core + per-game files. New/updated tests for `ParentDashboard` (manifest-name lookup replacing raw `gameId` in both the missed-items heading/aria-label and the streak table), `Dashboard`/`AdminPage` (translated tag labels with `defaultValue` fallback for custom tags), and the language-selector's "hidden when only one locale" behavior.
- **Accessibility (jest-axe):** unchanged mechanically (still runs automatically per component), but now exercises the new focus-visible styles and the reduced-motion/contrast changes as part of existing render assertions.
- **Focus management:** new test per view (`GameIntro`, `GameResults`, and each top-level page) asserting `document.activeElement` is the view's heading after mount.
- **E2E (Playwright):** extend existing page-level `@axe-core/playwright` scans (already run per spec) to also cover post-transition states (game results screen, admin tab switches) now that they're reachable via keyboard focus assertions.
- **Visual regression:** no new baselines expected unless the disabled-choice contrast fix or focus ring changes visible chrome enough to shift existing Storybook screenshots — update baselines if `npx playwright test visual.spec.js --update-snapshots` shows diffs, review before committing.

## Documentation updates

- `docs/TESTING.md` — add a short "i18n file layout" note under the existing "i18n string convention" section describing the per-game `i18n/en.json` files and the collision check.
- `CLAUDE.md` — one-line addition noting that i18n strings follow the same per-game auto-discovery pattern as manifests/components.
- `CHANGELOG.md` — new entry documenting the i18n restructure and the a11y fixes.
- `package.json` — version bump to match whatever the next release number is at merge time.
