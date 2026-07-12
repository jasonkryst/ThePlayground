# Intro/results page exceeds device height (Issue #55)

## Problem

Issue #55: "Adjust the intro and results page CSS to be Max 100% device
height. Especially on tablet or phone." Confirmed by the reporter to also
reproduce on desktop/laptop, so this is not a mobile-viewport-unit quirk
(the classic `100vh`-includes-hidden-browser-chrome bug) — it reproduces on
any window short enough to expose the underlying layout bug.

## Root cause

`AppShell` (`src/components/AppShell.jsx`, `src/components/AppShell.css`)
wraps every route in `.shell`, which is `min-height: 100vh` and lays out a
sticky header, `<main class="shell__content">` (`flex: 1`), and a footer in
a column. `.shell__content`'s children are meant to fill exactly the space
left over after the header and footer — that's what `flex: 1` on the child
gets them.

When `AppShell` was introduced (`docs/superpowers/specs/2026-07-06-wrapper-ui-design.md`),
every per-game `.game` class was migrated from `min-height: 100vh` to
`flex: 1` (now `src/components/GameLayout.css`) for exactly this reason.
But that same spec explicitly carved out an exception:

> `GameIntro` and `GameResults` render unchanged as route content under the
> shell.

So `src/components/GameIntro.css`'s `.game-intro` and
`src/components/GameResults.css`'s `.results` still declare
`min-height: 100vh` — a leftover from when these components rendered
standalone, before `AppShell` existed. Nested inside `.shell__content`
(itself inside `.shell`, which is *already* `min-height: 100vh`), that
second full-viewport-height demand stacks on top of the header and footer:
total minimum page height becomes `header + 100vh + footer`, which exceeds
one screen on any device/window where the header+footer don't happen to fit
in the browser's own chrome margin. Tablet and phone make this obvious
because the header+footer are a larger fraction of a smaller screen (often
pushing the intro's Start button or the results' action buttons below the
fold), but a modestly-sized desktop/laptop browser window reproduces the
same overflow.

Confirmed by comparing the two: `.game` (`src/components/GameLayout.css`)
has no `min-height` at all — `flex: 1; width: 100%;` — while `.game-intro`/
`.results` are the only two route-content containers left still declaring
`min-height: 100vh`.

## Fix

Bring `.game-intro` and `.results` in line with `.game`'s already-correct
pattern: drop `min-height: 100vh`, add `flex: 1; width: 100%;`. Both are
already `display: flex; flex-direction: column; align-items: center;
justify-content: center;`, so once they're a flex item that actually grows
to fill `.shell__content`'s available space, `justify-content: center`
centers their content within that space — matching the original intent —
without ever demanding more than one screen's height.

If content is genuinely taller than the available space (e.g. a results
screen with a long missed-items list), the container simply grows past its
`flex: 1` basis like any normal box and the page scrolls — same behavior
`.game` already has for a tall game board. This is a deliberate non-goal:
the fix caps the *empty-space* case at one screen, it does not clip or
force-scroll legitimately long content.

No JS/component changes — this is CSS-only, in the same shape as the
`.dashboard__tab` hover-contrast fix (issue #47).

## Test plan

Layout/overflow behavior isn't observable in jsdom (no real box layout), so
all new coverage is Playwright e2e against real viewport sizes.

**New `e2e/intro-results-height.spec.js`:**
- Positive, three viewport sizes (phone ~390×844, tablet ~768×1024, and a
  modest desktop/laptop window ~1366×768 — chosen because it's the size
  class the reporter specifically confirmed still reproduces on desktop):
  the intro screen's document `scrollHeight` does not exceed `innerHeight`
  (no page scroll), and the Start button is in the viewport without
  scrolling.
- Same positive assertions for the results screen after a short play-through
  (few questions, so `missed` is small).
- Negative: set `questionsPerSession` to its max (20) via `/admin`, answer
  every question wrong, and assert the resulting long results screen is
  *allowed* to scroll (`scrollHeight > innerHeight`) at a phone viewport —
  guards against overcorrecting to a fixed/clipped height that would hide
  content instead of letting the page scroll.

**Visual regression:** `components-gameintro--*` and `components-gameresults--*`
baselines in `e2e/visual.spec.js-snapshots/` will change (Storybook has no
shell/flex ancestor, so `flex: 1` is inert there and content renders at its
natural top-aligned height instead of vertically centered in a full-viewport
box) — regenerate with `npx playwright test visual.spec.js --update-snapshots`
and review the diff before committing.

## Docs

- `package.json`: patch version bump.
- `CHANGELOG.md`: `### Fixed` entry for issue #55.

## Out of scope

- No change to `.shell`'s own `min-height: 100vh` (correct — the shell
  should always be at least one screen tall) or to `.game`/`GameLayout.css`
  (already correct).
- No mobile-viewport-unit change (`dvh`/`svh`) — not needed once the
  double-100vh stacking is removed, and the reporter confirmed this isn't a
  mobile-chrome-hiding artifact.
