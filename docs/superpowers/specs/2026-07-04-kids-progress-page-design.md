# Kids' "My Progress" Page

Date: 2026-07-04
Status: Approved

## Context

The Badge Gallery currently lives only inside `AdminPage`'s "Badges" tab — a parent-facing settings surface, text-heavy ("Locked" labels, plain headings) and not something a toddler is meant to browse independently. The request is to give kids their own page to see their badges and simple progress, separate from both the admin config (`/admin`, gear icon) and the existing parent analytics dashboard (`/parent`, chart icon, staying untouched).

The existing Badge Gallery in `AdminPage` stays exactly as-is — this is a net-new, parallel surface, not a replacement.

## Behavior

- New route `/my-progress`, new nav icon `🌟` labeled "My Progress" added to `Dashboard.jsx`'s header, alongside the existing `📊` (parent) and `⚙️` (admin) links.
- No PIN/auth gate — consistent with `/admin` and `/parent`, both open today.
- Page shows one section per game (manifest order), each with:
  - Header: the game's manifest `icon` and `name`, colored using the manifest's existing `color` field (the same token `GameCard` already uses for its border/glow — no new hardcoded colors).
  - Three stat tiles, each defaulting to `0` when there's no data yet (no special empty-page state; the page always renders one row per manifest):
    - 🎯 best accuracy % across that game's sessions
    - 🔥 best streak (from `adapter.getBestStreaks()`)
    - 🔢 total questions answered, lifetime (from `badgeData.lifetimeQuestions[gameId]`, already tracked for badges)
  - A badge row covering every entry in `BADGE_CATALOG`:
    - Earned (count > 0): full-color icon, plus `×N` if earned more than once.
    - Locked (count === 0): same icon, dimmed/grayscale via CSS filter, **no visible text** (unlike the admin gallery's "Locked" label — toddlers can't read). Still carries an `aria-label` (e.g. `"{badge name} — locked"` vs `"{badge name} — earned"`) so the locked/earned state isn't a purely visual-only cue for screen reader users.

## Architecture

### Routing & navigation

- `App.jsx`: add `<Route path="/my-progress" element={<KidsProgressPage manifests={manifests} />} />`, same prop pattern as `/admin`.
- `Dashboard.jsx`: add a third `dashboard__nav-link` (`🌟`, `aria-label={t('dashboard.myProgressLabel')}`) linking to `/my-progress`, next to the existing `📊`/`⚙️` links.

### `src/kids/KidsProgressPage.jsx` (+ `.css`)

New top-level folder, parallel to `src/admin/` and `src/parent/`. Follows `ParentDashboard.jsx`'s convention of defining small presentational subcomponents locally in the same file (e.g. `StatTile`, `GameProgressSection`, `BadgeChip`) rather than spinning up a separate component-per-file tree — this page has no cross-page reuse need for those pieces, matching the existing `ParentDashboard.jsx` (`ScoreTrendChart`, `StreakHistoryPanel`, etc. are all local functions in one file).

Data sourced exactly like `ParentDashboard`/`AdminPage` already do — no new hooks or adapter methods:
- `useScores()` → `getAllScores()`, filtered per-game and passed to the new `computeBestAccuracy` util.
- `useBadges()` → `badgeData.awards[gameId]` (badge counts) and `badgeData.lifetimeQuestions[gameId]`.
- `adapter.getBestStreaks()` → fetched on mount into local state via `useEffect`, same as `ParentDashboard.jsx` lines 259-261.

Renders a back link (`←` to `/`) and title, then one `GameProgressSection` per manifest.

### `src/utils/kidStats.js` (+ `__tests__/kidStats.test.js`)

One pure function:

```js
computeBestAccuracy(scores, gameId) // → integer percentage 0-100, or null if no eligible sessions
```

Filters `scores` to `gameId`, skips any session with `total <= 0` (avoids divide-by-zero and matches `computeScoreTrend`'s existing `total == null` guard in `dashboardUtils.js`), and returns the max `round(score / total * 100)` across the rest, or `null` if none remain.

### Badge rendering

Not shared with the existing `BadgeGallery` component — the locked-state treatment is a real behavioral fork (no text vs. "Locked" text), and `BadgeGallery.test.jsx` already asserts the "Locked" text exists, so forcing a shared component would mean threading a variant flag through a component whose current tests hard-code the other variant. A small local `BadgeChip` (inside `KidsProgressPage.jsx`) renders the icon + earned/locked visual state + `aria-label`, reusing `BADGE_CATALOG` from `src/lib/badges.js` as its only shared dependency with the admin gallery.

## Testing

Per `docs/TESTING.md`'s four layers:

- **Unit (Vitest):**
  - `kidStats.test.js` — positive: multiple sessions for a game picks the correct max %, ties resolve fine, rounding matches `Math.round`. Negative: empty `scores` array → `null`; gameId with no matching sessions → `null`; a session with `total: 0` is skipped rather than producing `NaN`/`Infinity`.
  - `KidsProgressPage.test.jsx` — mocks `useScores`, `useBadges`, and `storage/index`'s `getBestStreaks` the same way `AdminPage.test.jsx`/`ParentDashboard.test.jsx` already do. Positive: renders title and back link (`href="/"`); renders one section per manifest with correct name/icon; stat tiles show the right accuracy/streak/lifetime numbers; an earned badge shows its `×N` count and no "Locked"-style text anywhere on the page; a locked badge carries the dim/grayscale class and an `aria-label` ending in "locked". Negative: no scores and empty `badgeData`/`bestStreaks` at all → every stat renders `0`, every badge renders locked, no crash. Axe a11y check on both states.
  - `Dashboard.test.jsx` — add one case asserting the new `🌟` nav link renders with `href="/my-progress"`.
- **Accessibility (jest-axe):** included in `KidsProgressPage.test.jsx` per the pattern above; explicit check that locked badges (icon + CSS filter only) still expose their state via `aria-label`, since the visual-only design choice (no "Locked" text) makes this the sole non-visual signal.
- **E2E (Playwright):** new `e2e/kids-progress.spec.js` — navigate from `/` via the `🌟` link, assert the page loads with a section per known game, assert direct navigation to `/my-progress` works (SPA fallback, matching the existing `/admin`/`/game/:id` coverage called out in `README.md`'s Docker section). Include an `@axe-core/playwright` scan per `docs/TESTING.md`'s page-level a11y convention.
- **Visual regression (Storybook + Playwright screenshots):** add a story for the new page (or its `GameProgressSection`/`BadgeChip` pieces, whichever ends up reasonably isolated once written) under `src/kids/*.stories.jsx`; commit a baseline via `npx playwright test visual.spec.js --update-snapshots`.

## Documentation updates

- `README.md` — mention `/my-progress` alongside the existing `/admin`/`/parent` route references (including the Docker section's SPA-fallback route list).
- `docs/ENHANCEMENTS.md` — new "Recently Completed" entry, `### v0.9.0 — Kids' "My Progress" Page`.
- `CHANGELOG.md` — new `## [0.9.0]` entry.
- `package.json` — version bump `0.8.0` → `0.9.0`.
