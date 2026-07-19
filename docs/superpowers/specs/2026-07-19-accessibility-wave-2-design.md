# Accessibility Wave 2 — Design (Issue #83)

**Date:** 2026-07-19
**Scope:** Issue #83's "200% zoom / large-text audit" (`docs/ENHANCEMENTS.md` § Accessibility). Unlike wave 1 (issue #82), this issue names no pre-existing numbered findings from `docs/accessibility_usability.md` — the audit itself is part of this work. Findings below are fresh, produced by driving the real dev server with Playwright (not static review; jsdom can't observe reflow/scroll geometry, matching the precedent set by `docs/superpowers/specs/2026-07-11-intro-results-viewport-height-design.md`).

## Audit method and findings

"200% zoom" and "OS large-text settings" are two different browser mechanisms and were tested separately:

- **Full-page browser zoom** (Ctrl/Cmd `+`) scales the entire rendered page uniformly regardless of CSS units — for reflow-testing purposes, WCAG 1.4.10 itself defines 200% zoom on a 1280px baseline as equivalent to testing a 640 CSS-px viewport. Tested this way (Playwright at real viewport widths, not the nonstandard CSS `zoom` property, which was tried first and produces inconsistent sticky/scroll geometry unrelated to the app's own CSS — a tooling artifact, not a finding).
- **OS/browser "larger text" accessibility settings** scale the root/`rem`-relative font size specifically, independent of viewport size. Simulated by injecting `html { font-size: 32px !important }` (2× the browser default of 16px) via `page.addStyleTag`.

Both were run against the dashboard, a quiz game (Color Match, intro/play/results), and the memory game (Animal Memory Match, intro/board/results) — the two game types and the two screens (memory board, results) the issue explicitly names — at reference viewport sizes already established by `docs/superpowers/specs/2026-07-11-intro-results-viewport-height-design.md` (phone 390×844, tablet 768×1024 / 1024×768 landscape, desktop 1366×768), halved for the zoom-equivalent cases.

### Finding 1 — OS/browser large-text settings have no effect anywhere (WCAG 1.4.4, Resize Text)

Injecting the doubled root font-size produced a **byte-for-byte identical rendered page** versus baseline. Root cause, confirmed by an audit of every `font-size` declaration in `src/**/*.css`: 88 use fixed `px`, only 6 use `rem`/`em`. `rem` is relative to the root font-size; `px` is not — so nothing in the app's typography responds to this class of accessibility setting, regardless of viewport or zoom. This is distinct from full-page zoom (which already works today, since it scales uniformly regardless of units).

### Finding 2 — sticky header can hide a keyboard-focused memory tile (WCAG 2.2 SC 2.4.11, Focus Not Obscured)

At a 200%-zoom-equivalent viewport for a landscape tablet (1024×768 → 512×384; the memory game requires landscape via `OrientationGate`), real Tab-key navigation into the memory board was driven and each focused element's geometry measured against `.shell__header`'s (`position: sticky; top: 0`) actual bounding box. **7 of 15 Tab stops landed on a tile that was 71% covered by the header** (tile `rect.top: 0, bottom: 143`; header `bottom: 102`). The same test against quiz choices and the quiz results screen (including a deliberately-long missed-items list) found **zero** obscured focus stops — this is specific to the memory board, whose content is the one screen tall enough at a shrunk viewport to trigger the browser's native focus-driven scroll-into-view, which has no way to know a sticky header will cover part of whatever it scrolls into place — nothing in the codebase sets `scroll-padding-top` or `scroll-margin-top` anywhere.

### Ruled out

No horizontal overflow (`document.documentElement.scrollWidth > clientWidth`) was found at any zoom-equivalent viewport width across any tested route (dashboard, quiz intro/play/results, memory intro/board/results, admin) — the app's existing mobile-first responsive design already handles reflow correctly at the document level. The problem is specifically the two findings above, not general reflow breakage.

## Fix 1 — px → rem font-size conversion (whole app)

Convert every `font-size: Npx` declaration in `src/**/*.css` to `(N/16)rem` (the app's root is un-overridden, so this is value-preserving at default settings: `20px` → `1.25rem`). Files affected (19, found via `grep -rl "font-size:\s*[0-9.]*px" src --include="*.css"`):

```
src/admin/AdminPage.css            src/components/GameChoiceGrid.css
src/components/AppShell.css        src/components/GameIntro.css
src/components/BadgeGallery.css    src/components/GameResults.css
src/components/CategorySection.css src/components/OrientationOverlay.css
src/components/Dashboard.css       src/components/QuizGameShell.css
src/components/ExitConfirmDialog.css src/components/ScoreHistory.css
src/components/FeaturedGameCard.css  src/components/StreakBadge.css
src/components/GameCard.css        src/components/Timer.css
src/index.css                      src/kids/KidsProgressPage.css
src/parent/DateRangeFilter.css      src/parent/ParentDashboard.css
```

`line-height` values expressed in `px` and tied to one of these `font-size`s convert alongside it (same reasoning — it should scale with its own text).

**Explicitly out of scope:** padding, gap, border-radius, and non-text width/height (including the 64×64/120px tap-target system and the issue-#58 memory-grid math) stay in `px` — this fix is scoped to text resize (what WCAG 1.4.4 requires), not a full re-layout. `<img>`-based icon dimensions (e.g. `img.shell__title-icon`) stay in `px` — icons aren't text. Font-glyph/emoji-based icons that already ride on `font-size` (e.g. memory-tile glyphs) scale for free as part of this conversion.

**Special case:** `ParentDashboard.css`'s `.heatmap__day-label` pairs `font-size: 10px` with a *fixed* `width/height: 14px` box; converting the font-size without the box would clip the label once it scales up. Fix alongside the conversion: `width`/`height` → `min-width`/`min-height` for `.heatmap__day-label` only (its sibling `.heatmap__cell`, a plain colored square with no text, is unaffected and untouched). No other fixed (non-`min-`) `height` declaration in the codebase is text-bearing (verified: checkbox inputs, `.sr-only`, the admin's visually-hidden toggle input, and `.parent__missed-bar-wrap` are all non-text, confirmed by inspection).

**Accepted trade-off, left alone:** `.shell__title`'s single-line `overflow: hidden; text-overflow: ellipsis` (the route title in the header) will truncate more aggressively once its font-size can scale larger. This is the standard WCAG-compliant degradation for width overflow — the full text remains in the DOM/accessible name for assistive tech, only the sighted-visual truncates further — and the existing code comment already documents this as a deliberate fallback. Redesigning header title wrapping is out of scope for this issue.

## Fix 2 — dynamic header-height CSS var + scroll-padding

**New hook, `src/hooks/useHeaderHeightVar.js`:** accepts a ref to the header element; via `ResizeObserver`, publishes its live rendered height as `document.documentElement.style.setProperty('--shell-header-height', \`${height}px\`)`, and disconnects the observer on unmount. A dedicated hook (not inlined in `AppShell.jsx`) because "measure an element, publish a CSS var" is an independent, unit-testable concern, matching this codebase's existing per-concern hook pattern (`useFocusOnMount`, `useSettings`).

**Wiring:** `AppShell.jsx` passes a ref for `<header className="shell__header">` into the new hook.

**CSS (`src/index.css`):**
```css
html { scroll-padding-top: var(--shell-header-height, 0px); }
```
Single point of truth: any native browser scroll-into-view (keyboard focus, anchor jump, `Element.focus()`'s implicit scroll) now reserves space for the sticky header automatically, whatever its current height is — no per-element `scroll-margin-top` needed anywhere.

**Why dynamic, not a static worst-case constant:** the header's height already varies today (one row on the dashboard, two rows with a title on game/subpage routes) and will vary further once Fix 1 makes its own `font-size`s responsive to large-text settings. A static value would go stale the moment either variable changes, or under both at once (zoomed *and* large-text). The `ResizeObserver` stays correct automatically and requires no future maintenance when header content changes.

## Testing plan

Positive and negative cases at each layer, per standing preference.

**Unit (`src/hooks/__tests__/useHeaderHeightVar.test.js`):**
- Positive: a mocked `ResizeObserver` callback firing with a height sets `--shell-header-height` to that value.
- Negative: unmounting disconnects the observer — no further property writes after unmount.

**New `e2e/zoom-large-text.spec.js`** (reusable suite, not just fix-scoped, so future games/routes inherit this coverage):
- Shared helper `simulateLargeText(page, scale)` (`page.addStyleTag` forcing root `font-size`) and a viewport matrix built from this repo's existing issue-#55 reference sizes, halved for the 200%-zoom-equivalent cases: desktop 1366×768 → 683×384, tablet-landscape 1024×768 → 512×384.
- Positive: no horizontal overflow at both zoom-equivalent viewports, across dashboard/quiz/memory-board/results routes.
- Positive: Tab-navigating the memory board at the tablet-landscape zoom-equivalent viewport, no focused tile's bounding rect is ever covered by the sticky header — the direct regression guard for Finding 2.
- Negative: on the dashboard route (one-row header, no title), the published `--shell-header-height` equals the actual one-row header height, not an inflated worst-case constant — guards against over-reserving scroll space when it isn't needed.
- Positive: under `simulateLargeText(page, 2)`, a sampled quiz-choice label's and a memory-tile's `getComputedStyle().fontSize` measure ~2× baseline — the regression guard for Fix 1 itself.
- Negative: the large-text scenario introduces no *new* horizontal overflow at the standard (non-zoomed) reference viewports — guards against text-driven wrapping overflow that zoom-equivalent testing alone wouldn't catch.

**Component tests:** existing snapshot/computed-style assertions that hardcode a `px` font-size value get updated to the new `rem` value where applicable.

**Visual regression:** the expected, large, one-time cost of whole-app scope — essentially every Storybook/e2e visual baseline changes since font-size pixel values shift throughout. Regenerate via `npx playwright test visual.spec.js --update-snapshots` and review the full diff before committing.

## Docs

- `package.json`: minor version bump (cross-cutting visible change, not a patch-level tweak).
- `CHANGELOG.md`: new `### Fixed` entry for issue #83, naming both findings.
- `docs/ENHANCEMENTS.md`: remove the "200% zoom / large-text audit" bullet under Accessibility (shipped).
- `docs/accessibility_usability.md`: not edited — it's an explicit point-in-time audit record (per its own header) and predates this issue; these findings are folded into this spec instead of retroactively added there.

## Out of scope

- AU-7 (dashboard tap-target height) and AU-8 (silent blocked-autoplay) — separate, already-tracked backlog items; issue #83 only names the zoom/large-text audit.
- Any change to padding, gap, tap-target minimums, or the issue-#58 memory-grid sizing math — Fix 1 is scoped to text resize, not general re-layout.
- Redesigning `.shell__title`'s truncation behavior (see accepted trade-off above).
- RTL `dir` sync, switch-access, and real assistive-technology passes — pre-existing separate backlog items, untouched here.
