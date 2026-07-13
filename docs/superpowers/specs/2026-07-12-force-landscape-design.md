# Force Landscape via Manifest — Design

**Issue:** #62 · **Date:** 2026-07-12 · **Status:** Approved

## Problem

Some games (memory cards first) only lay out well in a horizontal viewport. A game
should be able to declare, in its manifest, that landscape is mandatory; the engine
should enforce it for the whole game route, tell the player on the intro slide, and
continuously validate during gameplay — notifying (and blocking) when the layout
goes portrait.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Detection basis | Hybrid: physical device orientation on touch devices, viewport aspect ratio on desktop |
| Mid-game violation | Blocking overlay **and** session timer pauses |
| Manifest shape | Optional enum `"orientation": "landscape"` (absent = any; future `"portrait"` is free) |
| Screen Orientation lock API | Not used — overlay only, one predictable behavior everywhere |
| Coverage | Whole game route (intro, gameplay, results) |
| Cross-cutting | Full a11y, i18n, and polished UX required |

## Manifest contract

- New **optional** manifest field `orientation`. Recognized value: `"landscape"`.
- Absent or unrecognized value → no enforcement (identical to today).
- `src/games/animal-memory-match/manifest.json` adds `"orientation": "landscape"`
  and bumps its version.

## Architecture

Engine-level gate + React context. Games need zero wiring — the flag in the
manifest is the entire opt-in, consistent with the auto-discovery philosophy.

### `useOrientation()` — `src/hooks/useOrientation.js`

Returns `'landscape' | 'portrait'`, live-updated.

- Touch devices — `matchMedia('(pointer: coarse)')` matches **and**
  `screen.orientation` is available: derive from `screen.orientation.type`
  (`landscape-*` → `'landscape'`), subscribing to its `change` event.
- Otherwise (desktop, or touch device without `screen.orientation`, e.g. older
  iOS Safari): derive from `matchMedia('(orientation: landscape)')`, subscribing
  to its `change` event.

### `OrientationGate` — `src/components/OrientationGate.jsx` + `.css`

Rendered by `GameRoute` in `src/App.jsx` (manifests are already in module scope
there), wrapping the lazy game component:

```jsx
<OrientationGate orientation={manifest?.orientation}>
  <Game onGameEnd={...} />
</OrientationGate>
```

Behavior:

- Always provides `OrientationGateContext` (in `src/components/OrientationGateContext.js`,
  alongside the existing `ShellContext` pattern) with value `{ blocked: boolean }`.
  Default context value is `{ blocked: false }` so consumers work outside the gate
  (tests, Storybook).
- No `orientation` requirement, or requirement satisfied → children render
  normally, `blocked: false`.
- Requirement unsatisfied → `blocked: true` and:
  - Children stay **mounted** (game state survives rotation) inside a wrapper
    that gets `inert` + `aria-hidden="true"` via `setAttribute` — the exact
    pattern `AppShell` uses for `ExitConfirmDialog`.
  - A blocking overlay covers the **game content area only** — the shell header
    (🏠 home button) and footer stay reachable, so a parent can always exit
    without rotating.
  - Overlay content: large device glyph with a gentle rotate animation
    (suppressed under `prefers-reduced-motion`), i18n heading
    (e.g. "Turn your tablet sideways! ↔️"), i18n body line.
  - A11y: overlay is announced assertively (live region); focus moves to the
    overlay heading (`tabIndex={-1}`) when it appears and is restored to the
    previously focused element when it clears.

### Timer pause + input guard — `src/hooks/useMemorySession.js`

The hook reads `OrientationGateContext`. While `blocked`:

- The 100 ms elapsed-tick interval stops, freezing the displayed time.
- `flipTile` ignores input (defense in depth behind the overlay).

On transition `blocked → unblocked`, `startRef.current` is shifted forward by the
paused duration (`startRef.current += Date.now() - pausedAt`). Because every
downstream figure (`currentElapsedMs`, `durationMs`, personal-best speed records)
derives from `Date.now() - startRef.current`, paused time is excluded everywhere
with no other changes.

`useGameSession` (quiz games) is **out of scope**: it runs live per-question
countdown timeouts, and no quiz game requires landscape. Backlogged in
`docs/ENHANCEMENTS.md`.

### Intro notice — `src/components/GameIntro.jsx`

Optional `orientation` prop. When `"landscape"`, renders a notice row between the
instructions and the checkbox: ↔️ glyph (`aria-hidden`) + i18n text
("Play this game sideways!"). The memory game passes `manifest.orientation`.

### Dashboard indicator — `GameCard` + `FeaturedGameCard`

Both components already receive the manifest. When it requires landscape, render a
small ↔️ badge with an accessible i18n label ("Landscape only").

## i18n

New keys in `src/i18n/en.json` (and every other locale file present):
overlay heading + body under `common.*`, intro notice under `common.*`,
card badge label under `dashboard.*`. Follow the repo's existing string
convention documented in `docs/TESTING.md`.

## Testing

Positive **and** negative cases at every layer.

**Unit (Vitest + RTL):**

- `useOrientation`: coarse pointer follows `screen.orientation` incl. `change`
  events; fine pointer follows the aspect-ratio media query; negative — missing
  `screen.orientation` on a touch device falls back to the media query; unknown
  `screen.orientation.type` values don't crash.
- `OrientationGate`: unsatisfied → overlay rendered, wrapper `inert` +
  `aria-hidden`, context `blocked: true`, focus on overlay heading, focus
  restored on clear; negative — no manifest field → no overlay in either
  orientation and `blocked: false`; satisfied → children interactive, no
  overlay; unrecognized orientation value → treated as absent.
- `useMemorySession` pause (fake timers + mocked context): paused time excluded
  from `currentElapsedMs` and stored `durationMs`; `flipTile` no-ops while
  blocked; negative — never-blocked session times identically to today.
- `GameIntro`: notice renders with `orientation="landscape"`; negative — absent
  without the prop.
- `GameCard` / `FeaturedGameCard`: badge with accessible name when required;
  negative — no badge otherwise.

**E2E (Playwright):**

- Portrait viewport on `/game/animal-memory-match`: overlay visible, board not
  clickable, home button still operable; resize to landscape → overlay clears,
  game playable.
- A11y scan (axe) of the overlay state.
- Visual regression snapshot of the overlay.
- Negative: a non-landscape game (animal-sounds) in portrait shows no overlay.

**Storybook:** stories for `OrientationGate`'s overlay state and
`GameIntro` with the landscape notice.

## Documentation & housekeeping

- `README.md`: manifest field reference gains `orientation`.
- `CLAUDE.md`: architecture note (manifest contract line + gate/context seam).
- `docs/TESTING.md`: mock pattern for `matchMedia` / `screen.orientation` if one
  is established.
- `CHANGELOG.md` entry; app `package.json` version bump; memory-game manifest
  version bump.
- `docs/ENHANCEMENTS.md`: quiz-hook (`useGameSession`) pause support; possible
  future `"portrait"` manifest value.

## Error handling

- Missing browser APIs (`screen.orientation`, `matchMedia` listeners) degrade to
  the aspect-ratio path or, at worst, to "always landscape" (never a crash, never
  a permanently stuck overlay).
- Unrecognized manifest values are ignored rather than thrown, matching the
  forgiving manifest handling elsewhere.
