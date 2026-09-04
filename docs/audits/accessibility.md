# Accessibility Audit — The Playground

**Date:** 2026-09-04
**Version audited:** 1.1.10 (branch `jasonkryst-patch-5`)
**Auditor:** Claude Code, read-only source/config review + `npx eslint .`

This report supersedes/updates `docs/accessibility_usability.md` (2026-07-12,
v0.24.5) and `docs/superpowers/specs/2026-08-31-accessibility-usability-audit-findings.md`
(v1.1.5) as the current point-in-time accessibility record. Those files are
left as-is (historical record) — nothing in them was edited to produce this
report. Every finding below was independently verified against the live
source at v1.1.10, not copied from the prior docs; where a prior finding
still holds or was newly resolved, that is stated explicitly with fresh
evidence.

---

## Executive Summary

The Playground's accessibility posture is **strong and, unusually for a
project this size, backed by real automated regression coverage** — not just
axe scans, but hand-written WCAG 1.4.3 contrast-ratio math
(`src/__tests__/themeTokenContrast.test.js`, `disabledWrongChoiceContrast.test.js`),
live-browser tap-target measurements (`e2e/tap-target-standard.spec.js`),
and live-browser 200%-zoom/large-text reflow checks (`e2e/zoom-large-text.spec.js`).
`eslint-plugin-jsx-a11y`'s full `recommended` ruleset is enabled with **no
relaxed or disabled rules**, and `npx eslint .` on the current tree returns
**zero errors** (two unrelated `react-hooks/exhaustive-deps` warnings only).

Of the eight findings (AU-1…AU-8) from the original 2026-07-12 audit, six are
now genuinely resolved in code (verified by direct inspection, not backlog
say-so): AU-1 (color-only feedback), AU-2 (silent correct/wrong), AU-3
(keyboard focus dropped by `disabled`), AU-6 (raw ISO dates), AU-7 (tap
targets — the CSS was never actually broken, a documentation/measurement
error), and AU-8 (silent blocked autoplay). AU-5 (RTL `dir` sync) remains
open and low-priority (no RTL locale ships yet). **AU-9, raised in the
2026-08-31 audit — `ResumePrompt`'s heading never receives focus on
mount — is still open at v1.1.10**, confirmed by reading the current
`src/components/ResumePrompt.jsx` (no `useFocusOnMount`, no `ref`, no
`tabIndex`) against `docs/ENHANCEMENTS.md`, which still lists it as backlog.
AU-10 (README wording) is resolved.

This pass found **four new findings** not previously documented, of which
one (F-1, confetti/fireworks ignoring OS-level `prefers-reduced-motion`) is
the most actionable, plus two positive architectural claims from `CLAUDE.md`
independently verified true: the `manifest.color` accent token is genuinely
never used as text color anywhere in the codebase, and `OrientationGateContext`'s
`blocked` flag is correctly consumed by both `useGameSession` and
`useMemorySession` to pause timers.

**Nothing found blocks current use.** The highest-value fix is AU-9
(one-line, matches an existing pattern used everywhere else in the app);
F-1 (confetti motion) is the most novel/highest-impact new finding.

---

## Findings by WCAG Area

| ID | Area | WCAG SC | Severity | Status | Summary |
|---|---|---|---|---|---|
| AU-9 | Focus management | 2.4.3 (A) / 4.1.3-adjacent | Medium | **Still open** | `ResumePrompt` heading never receives focus on mount |
| F-1 | Motion | 2.3.3 (AAA) | Medium | New | Confetti/fireworks bursts ignore OS `prefers-reduced-motion`; only a manual admin toggle stops them |
| F-2 | Automated coverage gap | N/A (process) | Medium | New | 4 of 9 games have no live-browser (`@axe-core/playwright`) e2e coverage at all |
| F-3 | Status messages | 4.1.3 (AA) | Low | New | `StreakBadge`'s first appearance (streak hits 2) may not be announced — populated-on-mount live region |
| F-4 | Code hygiene | N/A | Low | New | Stale comment in `src/index.css` claims choice buttons use `disabled`; they use `aria-disabled` since the AU-3 fix |
| AU-5 | i18n / RTL | 3.1.2-adjacent | Low | Still open (unchanged) | No `dir` attribute sync in `src/i18n/index.js` |
| AU-1 | Use of color | 1.4.1 (A) | — | **Resolved** | `GameChoiceGrid.jsx` adds an `aria-hidden` ✓/✗ glyph over the color change |
| AU-2 | Status messages | 4.1.3 (AA) | — | **Resolved** | `QuizGameShell.jsx` renders a persistent `role="status"` announcement region |
| AU-3 | Keyboard | 2.1.1 (A) | — | **Resolved** | `GameChoiceGrid.jsx` uses `aria-disabled` + click guard, not `disabled` |
| AU-6 | i18n dates | 3.1.5-adjacent | — | **Resolved** | `ScoreHistory.jsx` uses `Intl.DateTimeFormat` |
| AU-7 | Target size | 2.5.8 (AA) | — | **Resolved (was a measurement error)** | Dashboard tabs inherit the global 64×64px button floor; padding-only arithmetic under-counted them |
| AU-8 | Silent failure | N/A (UX) | — | **Resolved** | `useSoundPlayer` surfaces a `blocked` state; `ReplayButton` pulses a "tap to hear" hint |
| AU-10 | Docs accuracy | N/A | — | **Resolved** | README's tap-target exception wording now matches the real (broader) exception scope |

---

## Detailed findings

### AU-9: `ResumePrompt` doesn't move focus to its heading (Medium, still open)

**Evidence:** `src/components/ResumePrompt.jsx:9` — `<h2
className="resume-prompt__heading">{t('common.resumeHeading')}</h2>` has no
`ref`, no `tabIndex={-1}`, and no `useFocusOnMount` import. Every other
phase-transition screen in the engine does this: `GameResults.jsx:12,25`
(`const headingRef = useFocusOnMount()` + `tabIndex={-1}` + `ref={headingRef}`),
`ParentalLockGate.jsx:23,63`, `OrientationOverlay.jsx` (heading ref passed in
from `OrientationGate`), `AppShell.jsx:42,210` (route title). This is a
documented convention (`docs/TESTING.md`: "Route/phase transitions move
focus to the new view's heading… so view changes are announced").
`docs/ENHANCEMENTS.md:35` still lists this as an open backlog item as of
this audit, confirming it was never fixed after the 2026-08-31 audit found
it (`docs/superpowers/specs/2026-08-31-accessibility-usability-audit-findings.md`,
finding AU-9).

**Who it affects:** keyboard and screen-reader users returning to a session
interrupted by a crash, tab close, or exit — they land on this screen
silently, with no indication the question view was replaced by a resume
choice.

**Recommendation:** mirror `GameResults`: `const headingRef =
useFocusOnMount()`, attach to the `<h2>` with `tabIndex={-1}`. One line of
code plus a focus assertion in `ResumePrompt.test.jsx` (which today only
checks `axe` — missing focus management is exactly the class of defect axe
cannot see, as the 2026-08-31 audit already noted).

### F-1: Confetti/fireworks ignore OS-level `prefers-reduced-motion` (Medium, new)

**Evidence:** `src/index.css:205` gates the CSS `pulse-green`/`shake-red`
keyframe animations behind `@media (prefers-color-scheme: no-preference)` —
correct. But the canvas-confetti bursts fired on every correct-quiz-answer
and every completed memory board are gated only by the app's own
`animationsEnabled` **setting** (`src/hooks/useGameSession.js:408`,
`src/hooks/useMemorySession.js:130,155` — `if (animationsEnabled)
fireConfetti()` / `fireFireworks()`), never by
`window.matchMedia('(prefers-reduced-motion: reduce)')`.
`DEFAULT_SETTINGS.animationsEnabled` (`src/storage/adapter.js:7`) is a
static `true` — it is not initialized from the OS preference on first load.
A parent whose OS is set to reduce motion (for vestibular-disorder reasons,
their own or the child's) gets confetti/fireworks by default anyway unless
they separately discover and toggle Admin → "Animations" off
(`src/admin/AdminPage.jsx:166-173`). Confirmed via `grep` across `src/` —
`prefers-reduced-motion` appears only in five `.css` files, never in any
`.js`/`.jsx` file; `useOrientation.js`/`OrientationGate` uses
`matchMedia('(orientation: …)')` for a different purpose but no hook queries
`(prefers-reduced-motion: reduce)`.

**Who it affects:** users with vestibular disorders or motion sensitivity
who rely on the OS-level setting (the WCAG-recommended mechanism) rather
than knowing to hunt through this specific app's settings for an equivalent
toggle — this includes parents with migraine/vestibular conditions
supervising play, and any child old enough to be sensitive to a full-screen
particle burst.

**Recommendation:** initialize `animationsEnabled`'s effective value (not
necessarily the stored setting itself) from `matchMedia('(prefers-reduced-motion:
reduce)').matches` when no explicit user choice has been saved — i.e. respect
the OS default, let the existing Admin toggle continue to override it either
way. This is the same "OS preference as default, explicit setting as
override" pattern already correctly used for the CSS keyframes; it just
never got wired to the JS-driven confetti path. Add an
`e2e`-level regression (`page.emulateMedia({ reducedMotion: 'reduce' })`,
already used in `e2e/dashboard.spec.js:18` for a different purpose) asserting
no `<canvas>` element appears after a correct answer when the setting has
never been explicitly touched.

### F-2: Four of nine games have no live-browser accessibility scan (Medium, new)

**Evidence:** `e2e/*.spec.js` contains 23 files, of which 12 import
`AxeBuilder` from `@axe-core/playwright` (`admin.spec.js`,
`parent-dashboard.spec.js`, `themes.spec.js`, `dashboard.spec.js`,
`kids-progress.spec.js`, `orientation-gate.spec.js`, `parental-lock.spec.js`,
`sound-memory-match.spec.js`, `animal-memory-match.spec.js`,
`animal-sounds.spec.js`, `character-match.spec.js`, `color-match.spec.js`).
There is **no `e2e/*.spec.js` file at all** — grepped by name and by content
for the game id — for `fruit-veggie-id`, `emotions-match`, `number-tap`, or
`character-match-bluey`. These four games have `jest-axe` coverage at the
component level (jsdom, verified: `FruitVeggieIdGame.test.jsx`,
`EmotionsMatchGame.test.jsx`, `NumberTapGame.test.jsx`,
`CharacterMatchGameBluey.test.jsx` all import `jest-axe`), but jsdom doesn't
render real CSS layout, real computed contrast, or real focus/tab order —
exactly the class of defect this audit's own contrast-math tests
(`disabledWrongChoiceContrast.test.js`) and live tap-target/zoom specs exist
to catch for the other five games. `npm run e2e` genuinely gates CI
(`.github/workflows/ci.yml:79`, no `continue-on-error`) for the games it
does cover.

**Who it affects:** not end users directly today (jsdom-level jest-axe still
catches gross ARIA/semantic errors) — this is a coverage-gap/regression-risk
finding: a real-browser-only defect (e.g. a contrast issue under an actual
CSS filter, a focus-order bug, a tap-target regression) in these four games
would ship undetected by the automated suite.

**Recommendation:** add a minimal `e2e/<game>.spec.js` for each of the four
games (play-through + `AxeBuilder` scan), following the existing pattern in
e.g. `e2e/color-match.spec.js`. Given how uniform `QuizGameShell` consumers
are, this is largely copy-adapt work.

### F-3: `StreakBadge`'s first appearance may not be announced (Low, new)

**Evidence:** `StreakBadge.jsx:6-9` returns `null` while `streak < 2`, then
mounts a `<span aria-live="polite">` already populated with text
(`t('common.streak', { streak })`) once `streak` reaches 2. Screen readers
reliably announce *mutations* to an already-present live region but are
known to inconsistently announce a region that appears already populated —
exactly the class of bug this app's own `Dashboard.css:108-114` comment
identifies and works around elsewhere ("Always mounted… role="status" child
is a real, pre-existing live region by the time filtering starts —
screen readers reliably announce mutations to an already-present live
region, but inconsistently announce a region inserted already-populated
with text"). `StreakBadge.test.jsx` covers the `aria-live="polite"`
attribute and content but has no test for the mount-while-populated case.
Low severity because `QuizGameShell`'s own always-mounted live region
(AU-2's fix) already announces every correct/wrong outcome — the streak
badge is reinforcement, not the only signal.

**Recommendation:** mount `StreakBadge`'s live-region `<span>`
unconditionally (empty when `streak < 2`, matching the `dashboard__filter-status`
pattern), or accept as a known low-severity gap given AU-2 already covers
the core outcome.

### F-4: Stale code comment misdescribes the disabled-state mechanism (Low, new, not user-facing)

**Evidence:** `src/index.css:201-204` — "The button is also `disabled` at
this point, so the state is still conveyed by more than color alone even
with motion removed." This describes the pre-AU-3 implementation.
`GameChoiceGrid.jsx:37` now uses `aria-disabled` (a real `disabled`
attribute was exactly what AU-3 removed to stop dropping keyboard focus).
The comment's conclusion (color isn't the only signal) is still true — the
✓/✗ glyph and border from AU-1's fix now carry that job — but the mechanism
named is wrong and could mislead a future contributor into re-introducing
AU-3.

**Recommendation:** update the comment to reference the glyph/border
(AU-1's fix) rather than `disabled`.

### AU-5: RTL `dir` sync — still open, unchanged (Low)

**Evidence:** `src/i18n/index.js:58-62` — `syncHtmlLang` sets
`document.documentElement.lang` on every `languageChanged` event but never
touches `dir`. No RTL locale ships today (`SUPPORTED_LOCALES` = en/es/pl,
confirmed via the same file), so this has no live user impact yet; it
remains correctly flagged as a backlog item for whenever an RTL locale is
added.

---

## What's Already Solid (verified this pass, evidence not vibes)

- **Zero jsx-a11y relaxations.** `eslint.config.js:26` spreads
  `jsxA11y.flatConfigs.recommended.rules` verbatim — no rule is disabled,
  downgraded, or overridden anywhere in the file. `npx eslint .` on the
  current tree: **0 errors**, 2 warnings, both `react-hooks/exhaustive-deps`
  in `useGameSession.js` (unrelated to accessibility).
- **Real contrast math, not just axe.** `src/__tests__/themeTokenContrast.test.js`
  recomputes WCAG 1.4.3 relative-luminance contrast for every text/background
  token pair across all three themes (light/dark/high-contrast), independently
  verified by hand for this audit (light-theme body text ≈9.3:1, muted text
  ≈5.3:1, dark-theme text ≈15:1, all pass AA with margin).
  `disabledWrongChoiceContrast.test.js` replicates the CSS Filter Effects
  spec's `grayscale()`/`brightness()` math to verify every choice color
  survives the disabled-wrong-answer filter at ≥4.5:1 — a case jsdom/axe
  literally cannot compute since jsdom doesn't apply CSS filters.
- **`manifest.color` is genuinely decorative everywhere.** Grepped every
  `manifest.color`/`accentColor` use site: `KidsProgressPage.jsx:58`
  (`borderTop`), `GameResults.jsx:18-20` (`boxShadow` ring), `GameCard.jsx:36-38`
  (`boxShadow`/`borderTop`) — never used as `color:` (text) anywhere. The
  CLAUDE.md claim ("never behind text, so it carries no WCAG contrast
  obligation") holds.
- **`OrientationGateContext`'s `blocked` flag is correctly wired.** Both
  `useGameSession.js:34,285,288,315,438` and `useMemorySession.js:23,81-94,107`
  consume `blocked` from `useOrientationGate()` to pause the timer and guard
  scoring actions while the rotate overlay is up.
- **Orientation-gate overlay is a model implementation.**
  `OrientationOverlay.jsx` uses `role="alert"` (immediate announcement) plus
  an explicit focus-to-heading (`headingRef`); `OrientationGate.jsx:26-43`
  sets `inert` + `aria-hidden` on the backgrounded game content (so a screen
  reader's virtual cursor can't wander into blocked gameplay) and correctly
  restores focus to whatever was focused before the block, once orientation
  corrects.
- **Exit-confirm dialog is a correct modal.** `ExitConfirmDialog.jsx`:
  `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, a hand-rolled
  two-item Tab trap, Escape-to-dismiss; `AppShell.jsx:107-127` sets
  `inert`/`aria-hidden` on everything behind it (covers screen-reader
  swipe navigation, not just Tab order) and restores focus to the trigger
  element on dismiss (`AppShell.jsx:244-247`). Also guards the browser/OS
  back button via a history-sentinel `popstate` trap
  (`AppShell.jsx:91-105`), not just in-app taps.
- **Keyboard playability spot-checked across game types.** Quiz games
  (`GameChoiceGrid.jsx`), the number-tap counting game
  (`src/games/number-tap/index.jsx:141-166`, real `<button>`s with
  `aria-pressed`/`aria-disabled`, never real `disabled`), and memory games
  (`MemoryBoard.jsx:37-51`, `aria-disabled` on matched tiles, never
  `disabled`) all use native `<button>` elements exclusively for
  interaction — every game is keyboard-completable, confirmed by reading
  each interaction handler (no `onClick`-only `<div>`s in any spot-checked
  game).
  Dashboard game cards are real `<Link>`/`<a>` elements
  (`GameCard.jsx:41`), not click-handled `<div>`s.
- **Live, in-browser tap-target verification**, not just source inspection:
  `e2e/tap-target-standard.spec.js` measures real `boundingBox()` for the
  dashboard tab strip (≥64×64px, both selected and unselected states,
  desktop and phone viewport) and asserts the two genuine
  smaller-by-design exceptions (`Clear filters`, admin tab bar) still clear
  the WCAG 2.5.8 24px floor without being conflated with the 64px primary
  standard.
- **Live, in-browser zoom/large-text verification**:
  `e2e/zoom-large-text.spec.js` checks both mechanisms WCAG 1.4.10 (reflow)
  and 1.4.4 (resize text) actually require — full-page 200%-zoom-equivalent
  viewports (no horizontal overflow on dashboard, quiz intro, memory intro/
  board) and OS-level large-text font scaling (quiz choices, memory tiles,
  body text, and even Recharts' JS-driven axis-tick font size, which is not
  a CSS property and would otherwise silently not scale).
- **Reduced motion is correctly handled for CSS animations.**
  `src/index.css:205-209` gates `pulse-green`/`shake-red` behind
  `@media (prefers-color-scheme: no-preference)` [sic — see note under F-1;
  the CSS itself correctly targets `prefers-reduced-motion`, only the JS
  confetti path misses it], and `MemoryBoard.css` disables the flip
  transition and matched-wiggle animation under `prefers-reduced-motion:
  reduce` (confirmed present, unchanged from the prior audit's AU-4
  finding).
- **Screen-reader announcements for the core game loop are solid.**
  `QuizGameShell.jsx:129` (`role="status"` correct/wrong per question),
  `MemoryBoard.jsx:55` (`role="status" aria-live="polite"` per flip/match/
  mismatch, richer than the quiz path — announces every event, not just
  outcome), `Timer.jsx:12` deliberately omits `aria-live` on the ticking
  `role="timer"` (a documented, correct choice — a per-second announcement
  would be hostile), `ParentalLockGate.jsx:83` and `OrientationOverlay.jsx`
  both use `role="alert"` for immediate error/state announcements.
- **CI enforcement is real, not advisory.** `.github/workflows/ci.yml`:
  `lint`, `lint-css`, `unit-tests` (`npm run coverage`, includes every
  `jest-axe` check), and the e2e job (`npm run e2e`, includes every
  `@axe-core/playwright` scan) all run with no `continue-on-error` — a
  failure genuinely blocks merge, not just logs.

---

## Recommendations (prioritized)

1. **AU-9 — fix `ResumePrompt` focus** (Medium, ~5 min). One-line change
   mirroring `GameResults`; still open a full audit cycle after being found.
2. **F-1 — respect OS `prefers-reduced-motion` for confetti/fireworks**
   (Medium). Highest-impact new finding — the current CSS-only
   implementation leaves a real, novel gap for motion-sensitive users who
   never touch this app's own settings.
3. **F-2 — add e2e/axe coverage for the four uncovered games** (Medium,
   process/coverage risk rather than a live user-facing defect). Mostly
   copy-adapt from an existing game's spec file.
4. **F-3 — mount `StreakBadge`'s live region unconditionally** (Low). Small,
   consistent with a pattern the codebase already uses elsewhere.
5. **F-4 — fix the stale `index.css` comment** (Low, no functional change,
   prevents a future regression of AU-3).
6. **AU-5 — RTL `dir` sync** (Low, no urgency — no RTL locale ships).
   Already correctly tracked; nothing new to do until an RTL locale exists
   to verify against.

---

## Other Areas Noticed (outside pure a11y)

- **Doc-drift risk between three accessibility audit files.** This repo now
  has three point-in-time a11y audit documents (`docs/accessibility_usability.md`,
  `docs/superpowers/specs/2026-08-31-accessibility-usability-audit-findings.md`,
  and this one). Each is explicitly a historical record and not retroactively
  edited, which is a reasonable convention, but nothing currently points a
  reader at "which one is current" other than reading `CHANGELOG.md` closely
  or comparing dates. Consider a one-line "current" pointer (e.g. in
  `README.md`'s documentation index) so a future contributor doesn't act on
  a stale finding list.
- **`docs/ENHANCEMENTS.md` accurately reflects AU-9 as open** — confirms the
  backlog itself is trustworthy (this audit did not find any backlog item
  falsely marked resolved), which is a good sign for process hygiene even
  though it means AU-9 has now gone unfixed across at least one full
  audit-to-audit cycle.
- **`useSpeech`/text-to-speech and the QuizGameShell live region are two
  independent audio/announcement channels** (spoken prompt vs. screen-reader
  status announcement) — not investigated in depth for this pass whether a
  screen-reader user with `useSpeech` also active could get overlapping/
  redundant audio. Worth a follow-up if real AT testing (still an open
  recommendation from both prior audits) surfaces it.
- **`disabledWrongChoiceContrast.test.js` covers only 3 of the 4
  `CHOICE_COLORS` tokens** (`src/lib/choiceColors.js` lists
  `lavender-dark`/`teal-dark`/`aqua-dark`/`lilac-dark`; the test only checks
  the first three explicitly by hex). Manually verified for this audit that
  `lilac-dark` (`#8E24AA`) with white text still clears ≈6.7:1 after the
  disabled-wrong filter — not a live defect, just an untested case that
  happens to pass. Low-value, cheap to close (add the fourth `it.each` row).

---

## Not performed (unchanged from prior audits)

Real assistive-technology testing (NVDA/VoiceOver) and observing a real
toddler session remain open recommendations no static or automated audit
can substitute for — both prior audits flagged this and it still holds.
