# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

The Playground — a browser-based game dashboard for infants/toddlers. React + Vite SPA. See `README.md` for full feature docs and the settings reference; `docs/DEPLOYMENT.md` for running it in production (Docker, nginx, HTTPS); `SECURITY.md` for the security posture; and `docs/ENHANCEMENTS.md` for the backlog of planned games/features.

## Commands

```bash
npm run dev              # dev server (Vite; file watcher uses polling, see vite.config.js)
npm run build             # production build → dist/
npm run preview            # serve the production build locally
npm run lint                # eslint .
npm run lint:css             # stylelint over source .css files
npm test                      # vitest, watch mode
npm run coverage               # vitest run --coverage (single run)
npm run e2e                     # playwright test — E2E, page-level a11y, visual regression, HTML/CSS validation
npm run validate:html            # HTML5 validation of rendered DOM only (subset of e2e)
npm run validate:css              # CSS validation of dynamic inline styles only (subset of e2e)
npm run storybook                  # browse component/game stories at localhost:6006
npm run build-storybook             # production Storybook build check
npm run mutation                     # stryker run — mutation testing over core hooks/utils
```

Run a single test file: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

See [`docs/TESTING.md`](docs/TESTING.md) for the full testing reference (all six layers, a11y, E2E, visual regression, i18n string convention).

## Architecture

**Auto-discovery is the core mechanic.** `src/App.jsx` uses Vite's `import.meta.glob('./games/*/manifest.json', { eager: true })` and `import.meta.glob('./games/*/index.jsx')` to find games. Dropping a new folder under `src/games/<id>/` with a `manifest.json` (the `tags` field is required; memory games also set `gameType: "memory"` (which also switches `GameResults`'s results headline to memory-appropriate wording); games that require a specific layout set `"orientation": "landscape"` or `"orientation": "portrait"` — the engine's `OrientationGate` (wrapping every game route in `src/App.jsx`) then blocks play in the wrong orientation with a rotate overlay and publishes `{ blocked }` via `OrientationGateContext`, which both `useMemorySession` and `useGameSession` consume to pause timing; and an optional `color` hex string is a light per-game accent, consumed as a plain inline style — never behind text, so it carries no WCAG contrast obligation — by `KidsProgressPage`'s card border and `GameResults`'s results-screen accent/ring) and `index.jsx` (default export accepting `onGameEnd`) makes it appear on the dashboard and routable at `/game/<id>` — no registry or import to edit. The same principle covers per-game i18n (`src/games/<id>/i18n/en.json`, picked up by `src/i18n/index.js`), per-game badge catalogs (`src/games/<id>/badges.js`, which fully replace the global quiz catalog for that game), and per-game dashboard icons (`src/games/<id>/icon.<ext>` — `png`/`gif`/`jpg`/`jpeg`/`webp`/`svg` — resolved by `src/lib/gameIcons.js` and rendered in place of the manifest's `icon` emoji when present).

**Storage is adapter-based.** Everything persisted (scores, settings, best streaks, personal bests, badge data, item stats, session-resume state) goes through the paired get/save interface in `src/storage/adapter.js` (`getScores`/`addScore`, `getSettings`/`saveSettings`, `getBestStreaks`/`saveBestStreaks`, `getPersonalBests`/`savePersonalBests`, `getBadgeData`/`saveBadgeData`, `getItemStats`/`saveItemStats`, `getSessionResume`/`saveSessionResume`/`clearSessionResume`) — every stored shape is documented in that file's JSDoc. A shared contract test suite (`src/storage/__tests__/adapterContract.js`) enforces conformance for any new adapter, though as of this writing it only exercises the original five get/save pairs — `getItemStats`/`saveItemStats` and the session-resume trio have no contract-test coverage yet. `src/storage/index.js` re-exports the active implementation (`localStorageAdapter.js`) — swapping to a real backend means writing a new adapter and changing that one export, not touching game code or hooks.

**Games consume shared state via hooks, not props drilling.** `useSettings()` and `useScores()` (in `src/hooks/`) wrap the storage adapter. Game components call these directly rather than receiving settings/scores from a parent. Every mounted `useSettings()` instance stays synchronized with every other during a session — `updateSetting`/`resetSettings` broadcast the new settings object to a module-level listener set, so a change in one instance (e.g. Admin) is reflected immediately in permanently-mounted siblings that never remount to refetch (e.g. `LocaleSync`, `GoogleAnalytics` in `src/App.jsx`), not just in components that happen to remount on navigation. The session loop itself is also a hook: quiz games get queue building, retries, hints, timers, scoring, personal bests, and badges from `useGameSession`; memory games use `useMemorySession` (+ the shared `MemoryBoard` component). Quiz games render through the shared `QuizGameShell` component (`src/components/QuizGameShell.jsx`), passing their session object plus content slots (prompt, choice rendering, missed-item rendering); the shell owns the intro/results wiring, timer, chime layer, and screen-reader live region (correct/wrong announcements — timeout keeps its existing visible `role="status"` row as the announcement path). Game audio goes through `useSoundPlayer`.

**Score shape:** base `{ gameId, score, total, date, timestamp }`; quiz sessions add `timings[]` and `peakStreak`, memory sessions add `flipAttempts`, `mismatches`, `peakMatchStreak`, and `durationMs` — see the JSDoc in `src/storage/adapter.js` for the full contract. **Settings shape:** see `DEFAULT_SETTINGS` in `src/storage/adapter.js` (`numChoices`, `feedbackMode`, `questionsPerSession`, `memoryPairs`, `timerMode`, `childName`, and the rest).

**Design tokens** (colors, radii) are CSS custom properties in `src/index.css` — use `var(--color-aqua)` etc. rather than hardcoding hex values, so games stay visually consistent with the dashboard.

**The app is a PWA** — `vite-plugin-pwa` (configured in `vite.config.js`) generates a precaching service worker and `manifest.webmanifest` at build time (this is a separate thing from every per-game `manifest.json` above, despite the name overlap). App icons live in `public/` and are regenerated by `scripts/generate-pwa-icons.mjs`. `npm run dev` never registers the service worker (`devOptions.enabled` is off, to avoid dev-time stale-cache confusion); use `npm run build && npm run preview` to see PWA behavior locally.

**Versioning:** app version is read from `package.json` at build time and shown in the dashboard footer; each game's version comes from its own `manifest.json` and is shown on that game's route. Bump both when releasing, and add an entry to `CHANGELOG.md`.

## Testing notes

Stack is Vitest + React Testing Library + jsdom. Tests live in `__tests__/` folders next to the code under test.

- Tests covering timed feedback (correct/wrong delays) must use `vi.useFakeTimers()` with `fireEvent`, not `userEvent` — `userEvent` deadlocks with fake timers in this stack.
- Hook tests mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()` so the mock exists before the hoisted `vi.mock` call runs.
- Game components expose a hidden `data-testid="correct-<thing>-id"` element so tests can assert the correct answer without depending on choice display order — follow this pattern for new games.
- Game audio's mock seam is the `useSoundPlayer` hook (like `src/lib/confetti.js` is for confetti) — mock the hook, not the browser `Audio` constructor.
- Matched memory tiles use `aria-disabled`, not `disabled` (keyboard focus must survive mid-game) — query and assert accordingly in memory-game tests.
