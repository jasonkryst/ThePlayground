# Wrapper UI — Seamless Shell Across Home, Games, Badges, Settings, and Parent Pages

**Date:** 2026-07-06
**Issue:** [#16 Wrapper UI](https://github.com/jasonkryst/ThePlayground/issues/16)
**Branch:** `16-wrapper-ui`

## Problem

The interface changes dramatically between areas of the app. Each area builds its own
page chrome from scratch:

- **Home** (`src/components/Dashboard.jsx`): app title, three emoji nav links
  (📊 parent, 🌟 my progress, ⚙️ settings), and a footer with app name/version.
- **Games** (`src/games/*/index.jsx`): each renders a full-page `.game` layout with its
  own mini header (game name, streak badge, game version) and **no way home during
  play**. The `.game` layout CSS is copy-pasted byte-identically across all three
  games' CSS files.
- **Settings** (`src/admin/AdminPage.jsx`), **Parent** (`src/parent/ParentDashboard.jsx`),
  and **Badges/Progress** (`src/kids/KidsProgressPage.jsx`): each has its own
  differently-styled header with a `←` back link.

Navigating between routes remounts all chrome, which reads as a jarring jump.

## Goal

One persistent wrapper (header + footer) shared by every route, so moving between
home, badges, settings, parent, and games feels like one application. Kid-safe exit
from games. Remove the duplicated per-game chrome and CSS.

## Approach (chosen)

**Layout route + narrow shell context.** A new `AppShell` component is mounted as a
React Router layout route wrapping all existing routes; pages render inside it via
`<Outlet/>`. Chrome is the same DOM node across navigations — it never remounts.

Rejected alternatives:
- *Shared header/footer components imported by each page*: chrome remounts per page;
  every new game must remember to opt in — same duplication problem in new clothes.
- *CSS-only unification*: doesn't add the missing in-game home button and
  de-duplicates nothing.

## Architecture

### Routing (`src/App.jsx`)

```jsx
<Routes>
  <Route element={<AppShell manifests={manifests} />}>
    <Route path="/"             element={<Dashboard manifests={manifests} />} />
    <Route path="/admin"        element={<AdminPage manifests={manifests} />} />
    <Route path="/parent"       element={<ParentDashboard manifests={manifests} />} />
    <Route path="/my-progress"  element={<KidsProgressPage manifests={manifests} />} />
    <Route path="/game/:gameId" element={<GameRoute />} />
  </Route>
</Routes>
```

### `AppShell` (`src/components/AppShell.jsx` + `AppShell.css`)

Renders `<header>` → `<main><Outlet/></main>` → conditional `<footer>`. Derives page
context from the current route: on `/game/:gameId` it looks up the game's manifest
(passed in via props) for the icon and name; on other routes it knows which nav state
to show. Exactly one `<header>` (banner) and one `<main>` landmark exist per page.

### `ShellContext` (`src/components/ShellContext.jsx`)

Provider lives inside `AppShell`. Exposes one narrow API to games:

- `setGameStatus({ streak, sessionActive })` — a game publishes its live streak and
  whether a run is in progress.

Games consume it through a thin hook, `useShellGameStatus(status)`, which pushes
updates on change and **clears status on unmount** so leaving a game always resets the
shell. Non-game pages never touch the context; their chrome is derived purely from the
route.

`sessionActive` is defined as: intro resolved, intro not showing, and results screen
not showing (`introResolved && !showIntro && !done`).

## Header

One component, three route-driven states:

| Route | Left | Center | Right |
|---|---|---|---|
| Home `/` | 🌊 brand (h1) | — | 📊 🌟 ⚙️ nav icons |
| `/admin`, `/parent`, `/my-progress` | ← back + 🌊 brand | page title | 📊 🌟 ⚙️ nav icons (current page's icon visually marked as current) |
| `/game/:gameId` | 🌊 brand | game icon + name + `StreakBadge` | 🏠 home button |

- The brand is always a link to `/`.
- Subpages keep the nav icons visible so a parent can hop between settings and the
  parent dashboard without returning home.
- Games drop the nav icons entirely: brand on the left, home button on the right.
- The dashboard keeps its personalized greeting (`titleNamed`/`titleDefault`) as page
  content; the shell brand is the static app identity. Focus management currently on
  the dashboard title (`tabIndex={-1}` + focus on mount) is preserved.
- All header labels come from i18n keys (existing `dashboard.*`/`admin.back`/
  `parent.back` keys are consolidated or superseded by new `shell.*` keys, with all
  locales updated).

## Kid-safe exit guard

While `sessionActive` is true, any exit attempt from a game — the 🏠 home button *or*
the brand link — opens a full-screen confirm overlay instead of navigating:

- Big primary button: **"Keep playing! ▶️"** (resumes play, default focus).
- Smaller secondary button: **"Leave game 🏠"** (navigates to `/`).
- `Escape` or tapping the backdrop resumes play.
- Overlay is `role="dialog"` with `aria-modal`, focus is trapped inside, and focus
  returns to the triggering element on close.

Rationale: a confirm overlay (two deliberate taps in different screen regions) is
chosen over press-and-hold because hold gestures are invisible to keyboard and
switch-access users and are harder to test.

When `sessionActive` is false (intro or results screen), exit controls navigate
immediately with no overlay.

## Footer

The existing app-name + version footer moves from `Dashboard.jsx` into `AppShell`.
Shown on all routes **except** `/game/:gameId` (games keep full vertical space for
play). The per-game version number in the old mini headers is dropped; it remains
available in each game's `manifest.json`.

## Game integration

Identical change in all three games (`color-match`, `animal-sounds`, `character-match`):

1. Delete the mini `.game__header` JSX block (game name, `StreakBadge`, version).
2. Add one hook call:
   `useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })`.
3. `GameIntro` and `GameResults` render unchanged as route content under the shell.

## CSS consolidation

- The byte-identical `.game { … }` layout rules move from the three per-game CSS files
  into one shared stylesheet, `src/components/GameLayout.css`, imported once.
- `.game__header`, `.game__name`, and `.game__version` rules are deleted (the header
  is gone).
- Per-game CSS files keep only genuinely game-specific rules (swatches, images, etc.).
- `.game`'s `min-height: 100vh` changes to fill the shell's content area instead
  (the shell owns the viewport height).
- New shell CSS uses the existing design tokens in `src/index.css`
  (`--color-*`, `--radius-*`, `--font-main`).

## Route transitions

The shell wraps `<Outlet/>` in a container keyed by `location.pathname`. A ~200ms
opacity fade-in runs on route change via CSS animation, wrapped in
`@media (prefers-reduced-motion: no-preference)` — the same gating pattern already
used for `pulse-green`/`shake-red`. No JS animation library.

## Error handling

- Unknown game id: `GameRoute` already renders "Game not found." — now inside the
  shell, so the user can navigate away with the header (no dead end).
- A game that never reports status (or crashes before doing so): shell defaults to
  `sessionActive: false` — exit controls simply work immediately. Guard failure is
  fail-open to navigation, never fail-locked.
- Stale status after leaving a game: prevented by the hook clearing on unmount.

## Testing

**New — `AppShell` unit tests** (`src/components/__tests__/`):
- Header state per route: home, each subpage, game route (name from manifest).
- Footer present on non-game routes, absent on game routes.
- Exit guard: overlay opens when `sessionActive`; "Keep playing" resumes; "Leave
  game" navigates to `/`; `Escape`/backdrop resumes; no overlay when session
  inactive; focus trap and focus restore; `role="dialog"`/`aria-modal`.
- `useShellGameStatus`: publishes on change, clears on unmount.

**Updated:**
- `App.test.jsx` — routes render within the shell.
- `Dashboard` tests/stories — nav-link and footer assertions move to AppShell tests.
- Each game's tests — drop mini-header assertions (name/version/streak); assert the
  game reports status upward.
- `AdminPage` / `ParentDashboard` / `KidsProgressPage` tests — back link is now
  shell-owned.
- Storybook — new `AppShell` story; update stories that rendered page chrome.
- Playwright e2e — update selectors that target in-game header elements; add an e2e
  for the exit-guard flow (start game → tap home → keep playing → tap home → leave).

**Covered automatically:** existing axe accessibility checks, Stylelint, and the
CSS/HTML validity Playwright specs run against the new markup and CSS.

## Documentation

- `README.md` Architecture section — add `AppShell`/`ShellContext`; note that games
  must not render their own page chrome (shell owns it) and how a game reports
  status via `useShellGameStatus`.
- `docs/TESTING.md` — note the new AppShell/exit-guard coverage.
- PR closes issue #16.

## Out of scope

- Redesigning individual page content (settings forms, charts, badge layouts).
- New navigation destinations or a parental gate on the parent/settings pages.
- Animated shared-element transitions beyond the simple cross-fade.
