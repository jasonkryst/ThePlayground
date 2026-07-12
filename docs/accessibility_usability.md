# Accessibility, i18n & UI/UX Audit — 2026-07-12

Full-application audit of The Playground at v0.24.5 (branch `61`), covering
accessibility (WCAG 2.2 AA lens), internationalization readiness, and UI/UX
heuristics. Follows the 2026-07-05 standards audit and the 2026-07-12
security audit (`docs/superpowers/specs/2026-07-12-security-audit-findings.md`).
Actionable items are tracked in `docs/ENHANCEMENTS.md`; this file is the
point-in-time record and is not edited retroactively.

## Scope & methodology

- **Automated baseline (executed for this audit):** the full e2e suite —
  119/119 passing, including `@axe-core/playwright` scans of every route,
  `jest-axe` on every component (727 unit tests, run earlier this session),
  HTML5 validation of the rendered DOM, CSS validation of dynamic inline
  styles, and all visual-regression baselines. **Zero axe violations.**
  Static `eslint-plugin-jsx-a11y` also clean.
- **Manual code review** of the surfaces automation can't judge: what
  *conveys* information (use of color), what gets *announced* (live
  regions), what happens to keyboard focus across state changes, i18n
  string/date coverage, and UX heuristics for the app's two distinct
  audiences (pre-literate children playing; parents configuring).
- Not performed: assistive-technology testing with a real screen reader
  (NVDA/VoiceOver) or with real users; noted under Recommended follow-ups.

**Result summary: automation is clean; five actionable findings (three
accessibility, one i18n, two UI/UX — one item spans both), one previously
tracked backlog item verified as already resolved, and a strong verified-good
list.** Nothing found blocks current use; AU-1/AU-2/AU-3 are the highest-value
fixes because they affect the child-facing core loop.

---

## Findings

| ID | Area | Severity | Summary |
|---|---|---|---|
| AU-1 | a11y (WCAG 1.4.1) | Medium | Quiz answer feedback is conveyed by background color alone |
| AU-2 | a11y (WCAG 4.1.3) | Medium | Correct/wrong outcomes are never announced to screen readers |
| AU-3 | a11y (keyboard) | Medium | Quiz choices use real `disabled`, dropping keyboard focus mid-game |
| AU-4 | a11y | Resolved | Memory-board reduced-motion coverage — verified already complete; stale backlog entry removed |
| AU-5 | i18n | Low (known) | RTL `dir` sync still outstanding (re-confirmed; existing backlog entry stands) |
| AU-6 | i18n | Low | Score history shows raw ISO dates instead of localized dates |
| AU-7 | UI/UX | Low | Dashboard filter tabs (~33 px tall) contradict the app's own "64×64 px minimum tap targets" claim |
| AU-8 | UX | Low | Blocked audio autoplay fails silently — a sound-prompt question can open with no prompt and no visual cue |

---

### AU-1: Quiz feedback is color-only — WCAG 1.4.1 Use of Color

**Evidence:** `src/index.css:99-101` — the static feedback states are
exactly `.correct { background: #a5d6a7 }`, `.wrong { background: #ef9a9a }`,
`.highlight-correct { background: #a5d6a7 }`. No glyph, no text, no border
change. The pulse/shake animations are a secondary non-color cue, but they
run only under `prefers-reduced-motion: no-preference` (`src/index.css:84-88`)
— for reduced-motion users the color *is* the entire signal. The two colors
are a light green and a light red of similar lightness: exactly the pair
red-green color-vision-deficient users (~8% of males) struggle to separate,
and axe cannot flag this because contrast *ratios* pass — the issue is what
carries the meaning, which is a human judgment.

**Who it affects:** color-vision-deficient children and parents;
reduced-motion users most severely (no animation fallback).

**The fix pattern already exists in this repo:** the memory game's mismatch
state adds a ✗ glyph (`memory-board__cross`, `MemoryBoard.css:84-91`) and a
4px outline on top of its color change — three independent signals.

**Recommendation:** add an `aria-hidden` ✓/✗ glyph (and/or a distinct
outline) to `.correct`/`.wrong`/`.highlight-correct` in the shared choice
rendering — one change in `GameChoiceGrid`, all three quiz games inherit it.
`aria-hidden` because the announcement channel is AU-2's job. Update the
GameChoiceGrid stories so the visual baselines capture the new states.
Tracked in `docs/ENHANCEMENTS.md` § Accessibility.

### AU-2: Correct/wrong is never announced — WCAG 4.1.3 Status Messages

**Evidence:** the only live regions in gameplay are the streak badge
(`StreakBadge.jsx:6-9` — returns `null` below streak 2, and a region that
unmounts announces nothing), the "Time's up!" row (`role="status"`, quiz
games), and the memory board's dedicated `sr-only` region
(`MemoryBoard.jsx:41`). Trace the two core outcomes for a screen-reader
user playing a quiz game: a **wrong answer** produces no announcement of
any kind (the streak silently resets and the badge unmounts); a **first or
second correct answer** likewise produces nothing (badge not yet mounted).
The child's own feedback is the color/animation (AU-1) and confetti —
both invisible to assistive tech.

**Contrast with:** the memory game, which announces every flip, match, and
mismatch through its live region — the engine's newer half already does
this right.

**Recommendation:** add a persistent visually-hidden `role="status"`
region to the quiz scaffold announcing localized "Correct!" / "Not quite —
it was {answer}" per question. The natural home is the planned
`QuizGameShell` engine component (see the ENHANCEMENTS core-engine
migration) so it's built once; if that lands later, add the region to
`GameChoiceGrid`'s parent markup now. Tracked in `docs/ENHANCEMENTS.md`
§ Accessibility.

### AU-3: Quiz choices drop keyboard focus — `GameChoiceGrid.jsx:25`

**Evidence:** `disabled={locked || isDisabledWrong}` puts a real
`disabled` attribute on the answer buttons. When a keyboard user activates
a choice (or exhausts a retry), the focused element becomes disabled and
the browser drops focus to `<body>`; the user must Tab back into the page
from the top. The repo already recognized and fixed this exact problem for
memory tiles in v0.23.0 — "Matched memory tiles use `aria-disabled`
instead of `disabled`, so keyboard focus is no longer dropped mid-game"
(`CHANGELOG.md`) — but the older quiz path was never given the same
treatment.

**Recommendation:** mirror the memory-tile fix: `aria-disabled` + an
early-return guard in the click handler (and keep the visual disabled
styling, which is class-based already). Verify with the existing fake-timer
test pattern that focus stays on the tapped choice through the
lock→advance transition. Tracked in `docs/ENHANCEMENTS.md` § Accessibility.

### AU-4: Memory-board reduced-motion — verified already complete (backlog corrected)

The ENHANCEMENTS backlog (as of this morning's issue-#61 rewrite) carried
"reduced-motion audit for the memory flip/mismatch animations." This audit
performed that check: `MemoryBoard.css:107-110` disables the flip
transition and the matched-wiggle animation under
`prefers-reduced-motion: reduce`, and the mismatch state is static (color +
outline + ✗ glyph — no animation to disable). Coverage is complete; the
backlog entry was removed as part of this audit. (Kept honest: the
*quiz-side* reduced-motion behavior is also correct — static `!important`
colors specifically exist for reduced-motion users, `src/index.css:90-98` —
its gap is AU-1's missing non-color glyph, not missing motion handling.)

### AU-5: RTL `dir` sync — still outstanding (no change)

Re-confirmed: `src/i18n/index.js:58-62` syncs `document.documentElement.lang`
on language change but never sets `dir`. Logical CSS properties shipped in
v0.16.0, so the app is otherwise RTL-ready. The existing backlog entry
(blocked on an actual RTL locale existing to verify against) stands as-is.

### AU-6: Score history shows raw ISO dates — `ScoreHistory.jsx:14`

**Evidence:** `{s.date ?? new Date(s.timestamp).toLocaleDateString()}` —
the stored `date` field is an ISO `YYYY-MM-DD` string and is rendered
verbatim; the locale-aware formatting only runs for legacy records missing
`date`. English users see "2026-07-12" where every other date-bearing
surface (Parent Dashboard month labels via `Intl.DateTimeFormat`,
`dateRangeUtils.js:79`) localizes properly.

**Recommendation:** format through `Intl.DateTimeFormat(i18n.language, …)`
(parse the ISO string as a local date deliberately — naive `new Date('YYYY-MM-DD')`
parses as UTC and can shift a day). Small, self-contained. Tracked in
`docs/ENHANCEMENTS.md` § Accessibility (i18n).

### AU-7: Filter tabs break the app's own tap-target standard — `Dashboard.css:31-41`

**Evidence:** `.dashboard__tab { padding: 6px 16px; font-size: 14px }` ≈
33 px tall. This passes WCAG 2.2 SC 2.5.8 (24 px minimum, verified
repo-wide in v0.14.0) but contradicts the README's own feature claim of
"64×64 px minimum tap targets **throughout**", and sits below the 44–48 px
comfortable-touch guidance (Apple HIG / web.dev) on the one page a child is
*most* likely to be handling the device. The admin and parent-dashboard
tab bars share the same compact sizing but are parent-only surfaces behind
deliberate navigation; the dashboard tab strip is on the home screen.

**Recommendation:** either raise the dashboard tab strip to ≥44 px height
(padding change; visual baselines regenerate) — recommended — or scope the
README claim to "child-facing game surfaces." Do one or the other; the
current claim-vs-reality gap is the actual defect. Tracked in
`docs/ENHANCEMENTS.md` § UX.

### AU-8: Blocked audio autoplay fails silently — `useSoundPlayer.js:27`

**Evidence:** `audio.play().catch(() => {})` — deliberate and correct as a
crash guard (documented in the hook's JSDoc), but nothing observes the
rejection. Animal Sounds auto-plays each question's sound on mount; if the
browser's autoplay policy blocks it (stricter in some WebViews/iOS Safari
configurations, or when a session starts without a qualifying gesture),
the child is shown four animal buttons with **no prompt at all** and no
indication anything failed. The 🔊 replay button is the recovery path, but
nothing directs anyone to it — a pre-literate child can't diagnose
"silent means tap the speaker."

**Recommendation:** surface the rejection: have `play()` return the
promise (or accept an `onBlocked` callback), and on rejection pulse/
highlight the replay button with a localized "tap to hear" hint until the
first successful playback. Also worth an e2e assertion that the replay
button exists and is ≥ the tap-target minimum (it is today — this guards
it). Tracked in `docs/ENHANCEMENTS.md` § UX.

---

## Verified-good (evidence, not vibes)

Recorded so future audits recognize regressions:

**Accessibility**
- **Zero axe violations** across all routes (page-level
  `@axe-core/playwright`) and all components (`jest-axe`), re-executed for
  this audit: 119/119 e2e, 727/727 unit.
- Exit-confirm dialog: focus trap, Escape dismissal, focus restoration to
  trigger, and `inert` + `aria-hidden` on background content — plus the
  history-sentinel back-button trap (v0.20.0).
- Route/phase transitions move focus to the new view's heading
  (`useFocusOnMount`), so view changes are announced.
- Memory tiles: keyboard-playable, `aria-disabled` (not `disabled`),
  per-event `sr-only` live announcements, ✗ glyph + outline on mismatch
  (three-signal feedback — the model AU-1 should copy).
- CSS-filter contrast regression test recomputes WCAG 1.4.3 math for every
  real color/text pairing (`disabledWrongChoiceContrast.test.js`) — covers
  the one contrast case jsdom/axe can't see.
- ARIA Tabs pattern complete on dashboard/admin tab bars; `role="timer"`
  on the timer (deliberately no `aria-live` — a ticking announcement every
  second would be hostile); locked badges convey state via `aria-label`
  without relying on the dimming filter.
- Reduced motion: quiz feedback (static `!important` colors), memory board
  (AU-4), and AppShell all carry `prefers-reduced-motion` handling.

**i18n**
- No hardcoded user-facing strings found (sweep of JSX literals and
  `aria-label`s — everything routes through `t()`; the untranslated brand
  wordmark "The Playground" and © line are deliberate brand strings).
- Per-game locale auto-merge with collision detection; CLDR plural
  suffixes in use; `<html lang>` synced on language change;
  `Intl.DateTimeFormat` with explicit locale for chart month labels.
- `escapeValue: false` is safe under the React-only-sinks constraint,
  documented in the 2026-07-12 security audit.

**UI/UX**
- Kid-safe exit guard covers taps *and* browser/OS back; fail-open for
  games that never report status.
- Intro/results screens fit one screen at phone/tablet/desktop (e2e-
  enforced, issue #55); memory board sizes to the viewport with 120 px+
  tiles (issue #58); answer cards meet the 64 px standard with 120 px
  minimum heights.
- How-to-play intros with per-game dismissal + admin replay; settings page
  grouped into General/Quiz/Memory sections; results screens surface
  personal bests, new badges, and missed items with review affordances.

## Recommended follow-ups beyond code

- **Real AT pass:** one NVDA (Windows) or VoiceOver (iPad — the likelier
  family device) session through a full game loop would validate AU-2's fix
  and catch pronunciation/verbosity issues no static audit can.
- **Watch a real toddler session** after AU-1/AU-8 land — the two findings
  most likely to be masked by an adult tester's compensating behavior.

## Cross-document actions taken with this audit

- `docs/ENHANCEMENTS.md`: AU-1, AU-2, AU-3, AU-6 added under Accessibility;
  AU-7, AU-8 added under UX; the stale memory-board reduced-motion entry
  removed (AU-4).
- `CHANGELOG.md` `[0.24.5]`: audit noted.
