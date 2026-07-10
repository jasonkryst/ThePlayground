# Filter tab hover/tap contrast fix (Issue #47)

## Problem

Issue #47 reports that the active/selected filter tab's text is "too light" on the
home dashboard. The reporter's screenshot (Android Chrome) shows the "All" tab —
which does have `.dashboard__tab--active` applied (its purple border is visible) —
rendered with a near-white/light-gray fill and white text, i.e. white-on-white,
rather than white-on-dark-purple.

Pixel-sampling the screenshot: interior fill ≈ `rgb(229,240,242)`, text ≈
`rgb(255,255,255)` → contrast ratio ≈ 1.16:1 (WCAG 2 AA requires 4.5:1 for this
14px/600-weight text). The fill color matches `--color-bg` (`#F0FDFF`) tinted by
`rgba(0,0,0,0.05)` — exactly the `.dashboard__tab:hover` background — not either
of `.dashboard__tab--active`'s historical background values.

The user separately confirmed: *"Looks like it's on mobile when clicked and on
desktop hover"* — i.e. the bug appears whenever the active tab is also hovered
(desktop pointer) or tapped (mobile, where touch commonly leaves a tab in a
sticky `:hover` state after release).

## Root cause

In `src/components/Dashboard.css`:

```css
.dashboard__tab:hover {
  background: rgb(0 0 0 / 5%);
}

.dashboard__tab--active {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
```

`.dashboard__tab:hover` is a class + a pseudo-class → CSS specificity (0,0,2,0).
`.dashboard__tab--active` is a single class → specificity (0,0,1,0). Per the CSS
cascade, specificity — not source order — decides the winner for a property both
rules declare (`background`). Because `:hover`'s specificity is higher, whenever
an element matches both selectors, `:hover`'s `background: rgb(0 0 0 / 5%)` wins,
silently reverting the active tab's solid dark-purple fill to a near-transparent
tint over the page background. `.dashboard__tab--active`'s `color: var(--color-surface)`
(white) is untouched (`:hover` never declares `color`), so the text stays white —
producing white-on-near-white.

Confirmed live: creating an element carrying the real `dashboard__tab
dashboard__tab--active` classes from the loaded stylesheet and hovering it via
real pointer automation (not synthetic DOM events) resolved to
`background-color: rgba(0, 0, 0, 0.05)`, matching the screenshot exactly.

This is not a Dashboard-specific mistake — it's a recurring specificity trap in
this codebase. The identical bug was already found and fixed twice before:

- `src/admin/AdminPage.css`: `.admin__tab--active:hover` (added in commit
  `1599e84`, "fix: ... fix locked-badge and active-tab contrast")
- `src/parent/DateRangeFilter.css`: `.date-range-filter__tab--active:hover`
  (added alongside the component in commit `e1ad443`, copying the AdminPage fix)

`Dashboard.css`'s tag tabs (added in `f4bef67`) never received the equivalent
rule — this is the one place the pattern was missed.

Neither existing fix has a regression test that actually simulates `:hover`.
Both files' e2e coverage (`e2e/admin.spec.js`, `e2e/parent-dashboard.spec.js`)
only guards against a *different* bug (the 150ms background/color CSS
transition still being mid-fade when an axe scan runs immediately after a
click) — it never moves the pointer onto the active tab, so it would not catch
this specificity bug if the `:hover` override rule were ever deleted. Stylelint's
`no-descending-specificity` rule (enabled via `stylelint-config-standard`) does
not flag this either — confirmed by running `npx stylelint` against all three
files with zero output.

## Fix

Add a `<component>__tab--active:hover` rule to `Dashboard.css`, matching the
existing convention (selector shape, comment wording, and — since Dashboard.css
already uses `var(--color-surface)` rather than AdminPage's hardcoded `#fff` —
follow `DateRangeFilter.css`'s exact variable usage):

```css
/* `.dashboard__tab:hover` (a class + a pseudo-class) has higher specificity
   than the single-class `.dashboard__tab--active`, so without this rule,
   hovering the active tab silently strips its solid background back to a
   faint rgba(0,0,0,0.05) tint while its white text color is untouched -- a
   real WCAG 2 AA color-contrast failure. Same pattern as
   `.admin__tab--active:hover` in src/admin/AdminPage.css and
   `.date-range-filter__tab--active:hover` in src/parent/DateRangeFilter.css;
   re-assert the active styling at equal specificity so it wins the cascade
   on hover too. */
.dashboard__tab--active:hover {
  background: var(--color-lavender-dark);
  border-color: var(--color-lavender-dark);
  color: var(--color-surface);
}
```

No JS/component changes — this is CSS-only.

## Test plan

CSS specificity/cascade behavior cannot be verified with jsdom-based unit
tests (jsdom does not compute a real CSS cascade for imported stylesheets);
all coverage here is Playwright e2e, using real pointer hover so `:hover`
genuinely matches.

**`e2e/dashboard.spec.js`** (new fix + new tests):
- Positive: hover the default-active "All" tab → `background-color` stays the
  resolved `--color-lavender-dark` value, not the hover tint.
- Positive (click→hover path): click "Sounds" to activate it, then hover it →
  same solid-background assertion, covering the real user flow (activate,
  then rest the pointer there).
- Negative: hover a tab that is *not* active → `background-color` is the
  `rgba(0, 0, 0, 0.05)` hover tint, confirming the fix doesn't remove hover
  feedback for ordinary tabs.
- Axe color-contrast scan while the active tab is hovered → zero violations
  (defense-in-depth, matching this file's existing a11y-scan convention).

**`e2e/admin.spec.js`** (test-only; CSS already fixed):
- Same three-part pattern (positive active-hover, positive click-then-hover,
  negative inactive-hover) against `.admin__tab--active`, using the "Badges"
  tab already exercised in this file.

**`e2e/parent-dashboard.spec.js`** (test-only; CSS already fixed):
- Same pattern against `.date-range-filter__tab--active`, using the "7 days"
  preset tab already exercised in this file.

## Docs

- `package.json`: bump `0.22.1` → `0.22.2` (patch, bug fix only).
- `CHANGELOG.md`: add a `## [0.22.2]` `### Fixed` entry describing the
  contrast bug and its scope (Dashboard; test coverage also added for the
  already-fixed Admin/Parent-Dashboard cases).

## Out of scope

- No change to `AdminPage.css` or `DateRangeFilter.css` CSS — they're already
  fixed; only test coverage is being added there.
- No visual redesign of the tab hover/active states beyond restoring the
  originally-intended colors.
