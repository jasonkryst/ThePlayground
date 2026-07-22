# Dashboard Tap-Target Standard (Issue #91)

## Problem

Issue #91 ("UX - TAP SIZE") asks to raise `.dashboard__tab` (the dashboard's
tag-filter pills, rendered by `TagFilterBar.jsx`) to at least 44px tall,
citing padding-only arithmetic (`padding: 6px 16px` + a 14px font ≈ 33px)
that contradicts the README's "64×64 px minimum tap targets throughout"
claim. This is a verbatim restatement of finding **AU-7** from the
2026-07-12 audit (`docs/accessibility_usability.md`).

## Current state (verified live, not just read from source)

`CHANGELOG.md`'s `[0.32.0]` entry already recorded this exact investigation:
`.dashboard__tab` is a plain `<button type="button">`
(`TagFilterBar.jsx:34-42`) with no `min-width`/`min-height` override in
either `Dashboard.css` or `TagFilterBar.css`, so it inherits the global
`button { min-width: 64px; min-height: 64px; }` rule
(`src/index.css:63-70`). A `min-height` floor wins over whatever height
padding + line content would otherwise produce, so the rendered box is
64×64px regardless of the 33px the padding arithmetic suggests. No CSS
change was made then, and the ENHANCEMENTS.md entry was removed.

Re-verified for this issue: still true today. Nothing in the tag-filter
rework since (issue #103, multi-select pills) touched sizing.

By contrast, two *other* tab bars deliberately override the global rule
downward, and are accepted parent-only exceptions per the audit:

- `.admin__tab` — explicit `min-height: 56px` (`AdminPage.css:20`)
- `.date-range-filter__tab` — explicit `min-height: 40px`
  (`DateRangeFilter.css:64`)

Both still clear WCAG 2.5.8's 24px absolute minimum; neither is part of
this issue's scope (parent-only surfaces, per the audit).

## Design

No CSS sizing change — the dashboard tab strip is already compliant. The
actual defect is that this fact is undiscoverable from reading
`Dashboard.css` alone (both the original audit and issue #91 derived a
wrong answer from padding math), so it keeps getting re-reported. The fix
is to make the fact visible and pin it down with a real-browser regression
test.

### 1. Code comment (`src/components/Dashboard.css`)

Add a comment directly above `.dashboard__tab` stating it inherits its
64×64px floor from the global `button` rule in `src/index.css`, and
pointing at the new e2e spec below as the guard — so a future edit that
adds an explicit `min-height` override here gets a visible pointer to what
it would break.

### 2. New e2e spec: `e2e/tap-target-standard.spec.js`

Playwright, real browser — the only layer that measures actual rendered
box size (jsdom performs no layout, so a unit test cannot observe this).
Follows the existing `getBoundingClientRect()`/`boundingBox()` measurement
pattern already used in `e2e/admin.spec.js` and `e2e/zoom-large-text.spec.js`.

**Positive cases:**
- Dashboard route, desktop viewport: every rendered `.dashboard__tab` pill
  has width ≥ 64 and height ≥ 64.
- Dashboard route, phone viewport (390×844, matching the existing phone
  fixture in `admin.spec.js`/`zoom-large-text.spec.js`): same assertion —
  confirms the floor holds at the smallest viewport a child is likely to
  use, not just desktop.
- Both a selected (`.dashboard__tab--active`) and unselected pill are
  checked, since the active-state override changes background/border but
  must not change box size.

**Negative cases (prove the assertion is scoped, and lock in the accepted
exceptions):**
- `.dashboard__clear-filters` and `.tag-filter-bar__toggle` (dashboard,
  same route) are asserted to be **below** 64px height (documented,
  deliberate secondary-control exception) but still ≥ 24px (WCAG 2.5.8
  floor).
- `.admin__tab` (admin route) asserted at its accepted ~56px, below 64,
  above 24.
- `.date-range-filter__tab` (parent route) asserted at its accepted ~40px,
  below 64, above 24.

This negative half matters for two reasons: it proves the 64px check isn't
trivially true for every button in the app (which would make the positive
assertion meaningless), and it guards against a future "fix" for this same
issue landing on the wrong (parent-only) tab bar instead of confirming the
dashboard strip is already fine.

No `@axe-core/playwright` scan is added to this spec — it asserts computed
layout geometry, not accessibility-tree/contrast concerns, which the
existing per-route specs already cover.

### 3. `docs/TESTING.md`

Add a row to the `e2e/` spec table (Layer 3 section) for
`tap-target-standard.spec.js`, describing what it covers, following the
existing one-line-per-spec format.

### 4. `README.md`

Reword the Features-list claim:

> - **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs;
>   64×64 px minimum tap targets throughout

to scope it to primary/child-facing controls, since `.admin__tab` and
`.date-range-filter__tab` are legitimate, accepted exceptions and
"throughout" currently overclaims for those two surfaces regardless of
issue #91. Exact wording, e.g.:

> 64×64 px minimum tap targets on primary/child-facing controls (compact
> secondary controls in parent-only surfaces are a deliberate exception —
> see `docs/accessibility_usability.md`)

### 5. `CHANGELOG.md` / `package.json`

Bump `package.json` version `0.32.2` → `0.32.3`. Add a `[0.32.3]` entry
under a `### Changed` heading (same pattern as the `[0.32.0]` AU-7 entry):
issue #91 investigated, reconfirmed the dashboard tab strip is already
64×64px via the global `button` rule, and locked the result in with
`e2e/tap-target-standard.spec.js` plus the `Dashboard.css` comment and the
README wording fix. No CSS sizing change.

## Explicitly out of scope

- `docs/accessibility_usability.md` — a point-in-time audit record, not
  edited retroactively (per its own preamble). Left as-is.
- `docs/ENHANCEMENTS.md` — the AU-7 entry was already removed in v0.32.0;
  nothing stale remains to clean up.
- No visual-regression baseline changes — no pixel output changes, so
  `e2e/visual.spec.js-snapshots/` is untouched.
- No change to `.admin__tab` or `.date-range-filter__tab` sizing — accepted
  exceptions, not part of this issue.

## Test plan summary

| Layer | Addition |
|---|---|
| e2e (new spec) | `tap-target-standard.spec.js` — 2 positive viewport checks × 2 pill states (dashboard), 3 negative checks (dashboard secondary controls, admin, parent) |
| Docs | `TESTING.md` spec table row; `README.md` wording; `CHANGELOG.md` entry |
| No changes | Unit/component tests (jsdom can't measure real layout), lint/lint:css (no new CSS rules), visual regression (no pixel change), `docs/accessibility_usability.md`, `docs/ENHANCEMENTS.md` |
