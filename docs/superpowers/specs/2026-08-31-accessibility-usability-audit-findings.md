# Accessibility, i18n & UI/UX Audit — 2026-08-31

Full re-audit of The Playground at v1.1.5 (branch `docs/audit-and-refresh`), covering
accessibility (WCAG 2.2 AA lens), internationalization readiness, and UI/UX
heuristics. Follows the 2026-07-12 audit (`docs/accessibility_usability.md`) and
the 2026-07-28 delta re-audit (`docs/superpowers/specs/2026-07-28-full-audit-findings.md`,
security-focused). Actionable items are tracked in `docs/ENHANCEMENTS.md`; this
file is the point-in-time record and is not edited retroactively.

## Scope & methodology

- **Automated baseline (executed for this audit):** the full e2e suite via
  `npm run e2e` — Playwright play-throughs, `@axe-core/playwright` scans of
  every route, HTML5/CSS validation, visual regression, and the Docker-backed
  nginx-headers/confetti-csp/pwa-csp specs. Unit/component tests (`npm run
  coverage`, including `jest-axe` on every component) were run earlier in this
  same session: 1431/1433 passing, with the 2 timeouts confirmed environmental
  (isolated rerun: both pass, well inside their timeout budgets).
- **Manual code review** re-verifying every 2026-07-12 finding (AU-1 through
  AU-8) against the current source, plus every surface added or materially
  changed since then: parental lock gate, orientation-gate rotate overlay,
  session-resume prompt, PWA install/offline UI, Character Match Bluey,
  Emotions Match, Number Tap, the Light/Dark/High-Contrast theme toggle, the
  tag-filter/search bar, and the Google Analytics opt-in field.
- Not performed: assistive-technology testing with a real screen reader
  (NVDA/VoiceOver) or with real users — still an open recommendation, unchanged
  from the 2026-07-12 audit.

**Result summary: every 2026-07-12 finding that ENHANCEMENTS.md's backlog
claimed as resolved (AU-1, AU-2, AU-3, AU-6, AU-8) is genuinely resolved in the
current code, confirmed by direct source inspection, not just the backlog's
say-so. AU-5 (RTL `dir` sync) is still open, unchanged. AU-7's underlying CSS
was deliberately left as-is (closed "no-CSS-change-needed"), but the doc-scope
fix that closure depended on is incomplete — see AU-10. Two new findings this
pass: AU-9 (Medium) and AU-10 (Low).**

---

## Findings

| ID | Area | Severity | Summary |
|---|---|---|---|
| AU-9 | a11y (WCAG 2.4.3 / SC 4.1.3-adjacent) | Medium | `ResumePrompt`'s heading never receives focus, unlike every other phase transition in the engine |
| AU-10 | Docs (claim accuracy) | Low | README's AU-7 tap-target exception wording doesn't cover the exception it was written to justify |

### AU-9: `ResumePrompt` doesn't move focus to its heading — `src/components/ResumePrompt.jsx`

**Evidence:** `GameResults` (`src/components/GameResults.jsx:12`) and
`ParentalLockGate` both call `useFocusOnMount()` on an `<h2>` so a keyboard/
screen-reader user is told a new screen appeared instead of silently losing
their place — this is the documented convention (`docs/TESTING.md`: "Route/
phase transitions move focus to the new view's heading (`useFocusOnMount`),
so view changes are announced"). `ResumePrompt.jsx` has an `<h2
className="resume-prompt__heading">` but no `ref`, no `useFocusOnMount` import,
and no `tabIndex={-1}`. It replaces the question view unpredictably — a
session left mid-game (crash, tab close, exit) resumes into this prompt
instead of the question the user expects — which is exactly the kind of
context switch the app's own convention exists to announce. `axe` reports no
violation (`src/components/__tests__/ResumePrompt.test.jsx`) because missing
focus management isn't something `axe`/`jest-axe` can detect — the same class
of blind spot the original AU-2 finding described.

**Who it affects:** keyboard and screen-reader users returning to an
interrupted session; a sighted mouse user sees the prompt immediately so isn't
affected the same way.

**Recommendation:** mirror `GameResults`: `const headingRef =
useFocusOnMount()`, attach it to the `<h2>` with `tabIndex={-1}`. One-line
fix; add a focus assertion to `ResumePrompt.test.jsx` alongside the existing
axe check so a future regression is a fast unit-test failure, not another
manual-audit finding. Tracked in `docs/ENHANCEMENTS.md` § Accessibility.

### AU-10: README's tap-target exception doesn't cover what it's used to justify — `README.md`

**Evidence:** the original AU-7 finding (2026-07-12) was about the dashboard's
own category tab strip (`.dashboard__tab`, ~33px, child-facing home screen)
failing the README's "64×64 px minimum tap targets" claim. The resolution
chosen (`src/components/Dashboard.css:28-31`, comment) was "closed as
no-CSS-change-needed" — i.e., fix the claim's scope instead of the CSS. But
the current README wording is: "64×64 px minimum tap targets on
primary/child-facing controls (compact secondary controls in **parent-only
surfaces, like the admin tab bar**, are a deliberate exception...)". The
dashboard tab strip is not a parent-only surface — it's the first thing a
child sees. Meanwhile `docs/TESTING.md`'s own description of
`e2e/tap-target-standard.spec.js` states the real, broader exception
correctly: "the dashboard's own secondary controls **and** the admin tab bar
— the one genuine smaller-by-design exception." The README claim and the
actual, tested exception scope have drifted apart; a reader trusting the
README's parenthetical would conclude the dashboard tabs are a bug, not a
documented exception.

**Recommendation:** reword the README parenthetical to match TESTING.md's
accurate scope — something like "compact secondary controls (e.g. the
dashboard's category tab strip, the admin tab bar) are a deliberate exception"
— dropping "parent-only surfaces" as the boundary, since it's factually the
wrong boundary. Owned by the parent conversation's doc-freshness pass, not
fixed in this audit file (this file is a historical record).

### AU-1 through AU-8: re-verified status

| ID | 2026-07-12 status | Re-verified 2026-08-31 |
|---|---|---|
| AU-1 (color-only feedback) | Open, Medium | **Resolved** — `GameChoiceGrid.jsx:22-26,42` renders an `aria-hidden` ✓/✗ glyph on top of the color change (three-signal: color + glyph + the existing animation), matching the memory-tile pattern the original finding pointed to |
| AU-2 (no correct/wrong announcement) | Open, Medium | **Resolved** — `QuizGameShell.jsx:46-49,129` renders a persistent `role="status"` region (`data-testid="quiz-live-region"`) with localized "Correct!"/"Not quite" text, built once in the shared shell exactly as recommended |
| AU-3 (keyboard focus dropped) | Open, Medium | **Resolved** — `GameChoiceGrid.jsx:37-38` uses `aria-disabled` plus an early-return guard in the click handler, not the real `disabled` attribute |
| AU-4 (memory reduced-motion) | Resolved (verified-good) | Unchanged, still correct |
| AU-5 (RTL `dir` sync) | Open, Low | **Still open** — `src/i18n/index.js:59` syncs `document.documentElement.lang` only; no `dir` assignment exists anywhere in the file |
| AU-6 (raw ISO dates) | Open, Low | **Resolved** — `ScoreHistory.jsx:16` now formats via `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })` |
| AU-7 (dashboard tab tap targets vs. README claim) | Open, Low | **Partially resolved** — CSS deliberately unchanged (documented decision); doc-scope fix incomplete, see new finding AU-10 above |
| AU-8 (silent blocked-audio autoplay) | Open, Low | **Resolved** — `useSoundPlayer.js:34` sets a `blocked` state on rejection; `e2e/animal-sounds.spec.js` covers both the recovery-hint-appears and no-hint-when-audio-plays-normally cases |

---

## New-surface review (added since 2026-07-12)

- **Parental lock gate** (`ParentalLockGate.jsx`) — wrong-attempt errors use
  `role="alert"` for immediate announcement; good.
- **Orientation-gate overlay** (`OrientationOverlay.jsx`) — `role="alert"` plus
  explicit focus-to-heading (per its own code comment); good, and covered by
  `e2e/orientation-gate.spec.js`'s axe scan.
- **Tag filter bar** (`TagFilterBar.jsx`) — `role="group"` with `aria-label`,
  each pill `aria-pressed`; correct toggle-button pattern.
- **Theme toggle** (`AppShell.jsx:181`) — `aria-label` resolves per current
  theme via `t(THEME_LABEL_KEY[currentTheme])`, so the accessible name updates
  as the theme cycles, not just the visual icon.
- **Session-resume prompt** — see AU-9 above; the one new-surface gap found.
- **Character Match Bluey, Emotions Match, Number Tap** — all render through
  the shared `QuizGameShell`, so they inherit AU-1/AU-2/AU-3's fixes and the
  intro/results focus handling automatically; nothing game-specific to flag.
- **PWA install/offline UI** — no custom install UI exists (browser-native
  install affordance only); nothing for this app's own accessibility surface
  to own here.
- **Google Analytics opt-in** — a plain labeled text field on the admin page,
  off by default; no consent-flow UI beyond the field itself. Consistent with
  `SECURITY.md`'s existing self-hosted/no-COPPA-exposure analysis — no change
  needed unless the hosting model changes (see `SECURITY.md`'s note on that).

## Recommended follow-ups beyond code

Unchanged from 2026-07-12: a real NVDA/VoiceOver pass, and watching a real
toddler session, remain the two follow-ups no static audit can substitute for.

## Cross-document actions taken with this audit

- This file only. `docs/ENHANCEMENTS.md`, `docs/accessibility_usability.md`,
  and `README.md` are intentionally left to the parent conversation's
  doc-freshness pass, to avoid a concurrent-edit conflict with a sibling
  security-audit pass running the same session. Recommended edits for that
  pass: add AU-9/AU-10 to `docs/ENHANCEMENTS.md` § Accessibility; the AU-1/
  AU-2/AU-3/AU-6/AU-8 entries there are already correctly marked resolved and
  need no change.
