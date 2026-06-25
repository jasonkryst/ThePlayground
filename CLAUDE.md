# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

The Playground — a browser-based game dashboard for infants/toddlers. React + Vite SPA. See `README.md` for full feature docs, Docker deployment, and the settings reference; see `docs/ENHANCEMENTS.md` for the backlog of planned games/features.

## Commands

```bash
npm run dev              # dev server (Vite, polling watcher enabled — repo lives on a network share)
npm run build             # production build → dist/
npm run lint               # eslint .
npm test                     # vitest, watch mode
npm run coverage              # vitest run --coverage (single run)
npm run e2e                    # playwright test — E2E, page-level a11y, and visual regression
npm run storybook                # browse component/game stories at localhost:6006
npm run build-storybook           # production Storybook build check
```

Run a single test file: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx`

See [`docs/TESTING.md`](docs/TESTING.md) for the full testing reference (a11y, E2E, visual regression, i18n string convention).

## Architecture

**Auto-discovery is the core mechanic.** `src/App.jsx` uses Vite's `import.meta.glob('./games/*/manifest.json', { eager: true })` and `import.meta.glob('./games/*/index.jsx')` to find games. Dropping a new folder under `src/games/<id>/` with a `manifest.json` and `index.jsx` (default export accepting `onGameEnd`) makes it appear on the dashboard and routable at `/game/<id>` — no registry or import to edit.

**Storage is adapter-based.** Everything persisted (scores, settings) goes through the four-method interface in `src/storage/adapter.js` (`getScores`, `addScore`, `getSettings`, `saveSettings`). `src/storage/index.js` re-exports the active implementation (`localStorageAdapter.js`) — swapping to a real backend means writing a new adapter and changing that one export, not touching game code or hooks.

**Games consume shared state via hooks, not props drilling.** `useSettings()` and `useScores()` (in `src/hooks/`) wrap the storage adapter. Game components call these directly rather than receiving settings/scores from a parent.

**Score shape:** `{ gameId, score, total, date, timestamp }`. **Settings shape:** see `DEFAULT_SETTINGS` in `src/storage/adapter.js` (`numChoices`, `feedbackMode`, `questionsPerSession`, `gaId`, `childName`).

**Design tokens** (colors, radii) are CSS custom properties in `src/index.css` — use `var(--color-aqua)` etc. rather than hardcoding hex values, so games stay visually consistent with the dashboard.

**Versioning:** app version is read from `package.json` at build time and shown in the dashboard footer; each game's version comes from its own `manifest.json` and is shown in that game's header. Bump both when releasing, and add an entry to `CHANGELOG.md`.

## Testing notes

Stack is Vitest + React Testing Library + jsdom. Tests live in `__tests__/` folders next to the code under test.

- Tests covering timed feedback (correct/wrong delays) must use `vi.useFakeTimers()` with `fireEvent`, not `userEvent` — `userEvent` deadlocks with fake timers in this stack.
- Hook tests mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()` so the mock exists before the hoisted `vi.mock` call runs.
- Game components expose a hidden `data-testid="correct-<thing>-id"` element so tests can assert the correct answer without depending on choice display order — follow this pattern for new games.
