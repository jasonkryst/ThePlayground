# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.18.0] - 2026-07-08

### Added
- `AppShell`, a React Router layout route providing one persistent header/footer shared by every page (home, settings, parent dashboard, my-progress, games), replacing per-page chrome (nav links, back links, page titles, footers, per-game mini headers).
- Kid-safe exit guard: leaving a game mid-session (home button or brand link) opens an `ExitConfirmDialog` requiring a deliberate second tap, so a stray toddler tap can't kill a session. Fail-open — a game that never reports status can always be exited immediately. Full jest-axe coverage, plus `e2e/app-shell.spec.js`.
- `ShellContext` / `useShellGameStatus({ streak, sessionActive })` — the interface games use to publish live status to the shell.
- Shared `GameLayout.css` for the game content region, replacing each game's own header/layout CSS.
- Color Match, Animal Sounds, Character Match (1.5.0/1.5.0/1.3.0 → 1.6.0/1.6.0/1.4.0): dropped their own mini headers (name, streak badge, version) in favor of reporting status to the shared shell via `useShellGameStatus`.

## [0.17.0] - 2026-07-06

### Added
- `e2e/css-validity.spec.js` — validates dynamic inline `style={{...}}` values (per-item colors in Color Match/Animal Sounds, tag accents on GameCard) against Stylelint's CSS3 conformance rules. This is the one CSS surface `npm run lint:css` can't reach, since it only scans `.css` files, not JS-generated style objects. Runs under `npm run e2e` or standalone via `npm run validate:css`.
- Documented explicitly (README, `docs/TESTING.md`) that Stylelint's existing `stylelint-config-standard`/`-recommended` rules already provide real CSS3 conformance checking — unknown properties/values/at-rules/selectors, the same class of check a W3C CSS validator performs — not just style preferences.

## [0.16.0] - 2026-07-06

### Added
- Pluralized `common.difficultyOfferHeading` via i18next's `_one`/`_other` CLDR suffix pair, so "Try 1 choice next time?" reads correctly instead of "1 choices" once a count of 1 is ever possible (today `numChoices` is always 2-4, so this was previously invisible in English).

### Fixed
- `ParentDashboard.css`'s two remaining physical-direction CSS properties (`text-align: left`/`right`) now use logical `start`/`end`, so the streak table and missed-items panel will correctly mirror once an RTL locale is added. A repo-wide grep confirmed these were the only two physical-direction declarations left in the app.

## [0.15.0] - 2026-07-06

### Added
- `eslint-plugin-jsx-a11y`, wired into `eslint.config.js` — a11y issues are now caught at edit time in code paths no test currently exercises, not only at test time via `jest-axe`/`@axe-core/playwright`. Lint came back clean, 0 new findings.
- Stylelint (`stylelint-config-standard`) + `.editorconfig`, via `npm run lint:css`.
- `e2e/html-validity.spec.js` — an offline HTML5 validator (`html-validate`) checking the rendered DOM (not the near-empty `index.html` shell) on every major route, running automatically under `npm run e2e`. The live W3C Nu Checker wasn't reachable from the audit's sandbox; this doesn't depend on network access.

### Fixed
- `vite.config.js`'s coverage now scopes to `src/**`, so the "All files" rollup reports a real aggregate (88.78%) instead of `0 | 0 | 0 | 0`.
- `eslint.config.js` no longer lints the generated `coverage/` folder.
- Six real `no-descending-specificity` CSS cases found by Stylelint (badge-lock icon dimming, and all three games' `.game__choice` disabled/focus/focus-visible states) — reordered so specificity reads ascending top-to-bottom; no visual change, since the higher-specificity rule already won regardless of position.
- `.sr-only`'s deprecated `clip: rect(...)` — added `clip-path: inset(50%)` as the modern rule, kept `clip` as an explicit, commented legacy fallback.
- `Timer.jsx`'s `aria-label` had no supporting ARIA role, found by the new HTML5 validator — added `role="timer"` (doesn't change its deliberate no-`aria-live` behavior).

## [0.14.0] - 2026-07-06

### Added
- ARIA Tabs pattern completed on Dashboard's category tabs and Admin's page tabs: each tab now has `aria-controls` linking to a matching `role="tabpanel"`/`aria-labelledby` content region, so screen readers announce what a tab governs, not just that it's selected.
- A confirmation step before Admin's "Reset to Defaults" takes effect — first tap prompts "Are you sure?", a second tap within 4 seconds confirms; letting the window elapse cancels.

### Fixed
- `Dashboard.css`'s hardcoded `color: #fff` now routes through `var(--color-surface)`.
- Found and fixed two real bugs while investigating the `!important` overrides on `.correct`/`.wrong`/`.highlight-correct`: `.wrong` was missing the same `!important` its siblings had, so wrong-answer feedback silently showed no red at all for Color Match/Animal Sounds under `prefers-reduced-motion: reduce`; and the `shake-red` keyframe's `background: inherit` at rest resolved to the *parent's* background rather than the button's own, leaving every wrong-answer choice fully transparent after its shake animation, in all three games. Verified via a real browser (Playwright), not assumed, with a new e2e regression test.
- Cleaned up React `act()` warnings in `ParentDashboard`, `KidsProgressPage`, `ColorMatchGame`, and `CharacterMatchGame` tests — the underlying async state updates (best-streak fetch, intro-dismissal transition) were real, just not fully awaited by the tests.
- Verified (no code change needed): every interactive control already meets WCAG 2.2 SC 2.5.8's 24×24px minimum target size, and the app has no modal/dialog pattern to trap keyboard focus.

## [0.13.0] - 2026-07-06

### Added
- `docs/superpowers/specs/2026-07-05-standards-audit-findings.md` — a combined audit of W3C HTML5/CSS3 validity, WCAG 2.2 AA accessibility, internationalization, usability, and code-quality tooling, plus a companion prioritized remediation plan (`docs/superpowers/plans/2026-07-05-standards-audit-remediation.md`).
- `src/__tests__/disabledWrongChoiceContrast.test.js` — a regression test that recomputes WCAG 1.4.3 contrast for every choice color/text pairing across all three games after the `.game__choice--disabled-wrong` CSS filter is applied, so a future palette change can't silently drop back below AA.

### Fixed
- Corrected the 0.12.0 disabled-wrong-choice contrast fix: `grayscale(85%) brightness(0.88)` looked fine on its own but actually failed WCAG 1.4.3 (< 4.5:1) for two Color Match swatches (red, blue) once their black/white choice text was filtered along with the background. Retuned to `grayscale(40%) brightness(1.2)`, verified >= 4.5:1 across every choice color used by any of the three games.

## [0.12.0] - 2026-07-05

### Added
- Per-game i18n locale files (`src/games/<id>/i18n/en.json`), auto-merged at startup — adding a game's translations no longer requires editing a shared file.
- `settings.locale` and a hidden-until-needed `LocaleSelector` in Admin Settings, so a second language can be added later without further plumbing.
- Dynamic `<html lang>` sync to the active i18next language.

### Fixed
- Added `:focus-visible` styling (matching the existing nav/card/tab pattern) to game answer choices, results buttons, the intro start button, the sound-replay button, and all Admin action/toggle buttons — previously only nav chrome had visible keyboard focus.
- Game phase transitions (intro → play → results) and top-level page loads now move focus to the new view's heading, so keyboard and screen-reader users are told when a new view appears.
- Correct/wrong answer feedback now respects `prefers-reduced-motion`.
- The disabled "already tried, wrong" choice state no longer risks dropping below AA text contrast (replaced an opacity-based fade with a fixed filter).
- `StreakBadge` announces streak changes via `aria-live="polite"`.
- Parent Dashboard's missed-items panel, streak table, and chart legends show each game's real name instead of its raw id; both trend charts gained a visually-hidden data-table alternative for screen readers.
- Admin's "No games found" message and Dashboard's category tag labels now go through `t()` instead of being hardcoded.

## [0.10.0] - 2026-07-04

### Added
- **Character Match** — a new game where a character's name is shown and the child picks the matching character from picture buttons; uses real images (PNG/GIF/JPEG) instead of emoji for each choice.
- `ManifestIcon` shared component — lets a game's dashboard tile/intro icon be an image instead of an emoji, without changing rendering for existing emoji-icon games.

## [0.9.0] - 2026-07-04

### Added
- **Kids' "My Progress" page** (`/my-progress`) — a kid-facing page, linked via a new 🌟 dashboard button, showing per-game best accuracy %, best streak, lifetime questions answered, and every milestone badge earned so far. Locked badges show a dimmed/grayscale icon with no text label (unlike the admin Badge Gallery's "Locked" text), since the target audience can't read; locked/earned state is still exposed to assistive tech via each badge's `aria-label`.
- `computeBestAccuracy` pure utility function (`src/utils/kidStats.js`).
- `KidsProgressPage` component (`src/kids/`).

## [0.8.0] - 2026-07-03

### Added
- **Answer within N seconds** — an admin-configurable countdown mode replaces the passive stopwatch; when a question's timer runs out, it locks in as missed (breaking the streak, added to the results-screen missed list) and always auto-advances after showing "Time's up!", regardless of feedback mode.
- **Per-session personal best** — a session's accuracy and average correct-answer speed are compared against that game's stored bests. Breaking either shows a banner on the results screen ("New accuracy record!" / "New speed record!"); a speed record only counts if the session's accuracy meets a configurable minimum (default 70%, adjustable in 5% increments up to 100%).
- **Milestone badges** — 8 repeatable, per-game achievements across three categories (streak tiers, perfect sessions, lifetime questions answered), each with an emoji icon shown on the results screen when newly earned and browsable in a new AdminPage "Badges" tab.
- `timerMode` (`'off' | 'countUp' | 'countdown'`), `timeLimitSeconds`, `speedRecordMinAccuracy` settings.
- `getPersonalBests`/`savePersonalBests` and `getBadgeData`/`saveBadgeData` storage adapter methods.
- `usePersonalBest`, `useBadges` hooks; `evaluatePersonalBest`, `computeBadgeAwards` pure utility functions; `BADGE_CATALOG` in `src/lib/badges.js`.
- `BadgeGallery` component.
- `timedOut` field on timing entries recorded when a countdown expires.

### Changed
- `timerDisplayEnabled` (boolean) is replaced by `timerMode`/`timeLimitSeconds`; existing stored settings are migrated automatically on load.
- `useGameSession` no longer accepts external `timeLimitMs`/`onTimeout` parameters — countdown behavior is now derived entirely from settings.
- `Timer` gains a `mode`/`limitMs` prop pair to support counting down.
- `GameResults` gains `personalBestResult`/`newBadges` props.

## [0.7.0] - 2026-07-02

### Added
- **How-to-play intro screens** — each game now shows an intro screen (icon, name, one-line instructions) before its first question on initial visit. A "Don't show this again" checkbox lets a parent permanently dismiss it per game; the admin Games tab gains a "Replay Intro" button to bring a dismissed intro back. The intro does not reappear after "Play Again" within the same visit.
- `introDismissed` setting: `{ [gameId]: true }`, default `{}`.
- `GameIntro` shared component.
- `useGameSession` gains `showIntro`, `settingsLoaded`, `dontShowAgain`, `setDontShowAgain`, `dismissIntro`.

## [0.6.0] - 2026-07-01

### Added
- **Timer display** — a running stopwatch shown next to each question, togglable in admin settings.
- **Retry attempts** — a configurable number of wrong taps (None / 1-5 / Unlimited) allowed before a question locks in as missed; wrong choices become disabled but stay visible so the child can try again.
- **Hints** — after a configurable number of wrong taps, the correct answer is highlighted without locking the question.
- **Retry counts toward streak** — configurable whether a correct-after-retry keeps the answer streak alive.
- **Spaced repetition queue** — missed items reappear a few questions later in the same session, replacing a not-yet-asked item so session length stays fixed.
- **Difficulty auto-progression** — after a perfect session (with the setting enabled), the results screen offers to raise the number of answer choices by 1.
- 7 new settings: `timerDisplayEnabled`, `maxTries`, `hintsEnabled`, `hintAfterWrongTaps`, `retryCountsAsStreak`, `spacedRepetitionEnabled`, `difficultyAutoProgressionEnabled`.
- `Timer`, `GameChoiceGrid` shared components.
- `attemptNumber` field on each timing entry.

### Changed
- `useGameSession`'s `answered` field is renamed to `locked`, and gains `disabledChoiceIds`/`hintActive`. Both games updated to match.

## [0.5.0] - 2026-06-30

### Added
- **Daily Challenge** — one game highlighted as "Today's Game" each day via a hero banner above the game grid. Selection is deterministic (date-seeded hash) so all users see the same featured game.
- **Recently Played badges** — game cards show a glow border and "Today · N plays" / "Yesterday · N plays" / "N days ago · N plays" badge when the game has been played before. Derived from existing score data with no schema changes.
- **Game Categories / Tags** — games are grouped under labeled section headings on the dashboard ("Sounds 🔊", "Visual 👁️", etc.). A filter tab strip lets parents view only one category at a time. Tags come from each game's `manifest.json` (now a required field) and can be overridden per-game in the admin panel.
- `useFeaturedGame`, `useRecentlyPlayed`, `useGameTags` hooks
- `FeaturedGameCard`, `CategorySection` components
- Tag override editor in AdminPage

## [0.4.0] - 2026-06-28

### Added
- **Parent Progress Dashboard** at `/parent` — accessible via the 📊 button on the main dashboard.
  - Score trend chart (accuracy % per game over time, powered by Recharts).
  - Response-time chart (average ms per answer per game over time).
  - Streak history table (last 7 days / last 30 days / all-time best per game).
  - Play calendar heatmap (13-week GitHub-style grid showing daily question counts).
  - Missed-items breakdown (horizontal bar chart of most-missed animals/colors per game).
  - Export to CSV button (downloads full score history for spreadsheets or clinician sharing).
- `peakStreak` field saved with each score record — highest consecutive-correct run in that session.
- `itemId` field added to each timing entry — required for the missed-items breakdown; older records are unaffected.

### Changed
- Dashboard header now shows two icon links (📊 Progress, ⚙️ Settings) in a `dashboard__nav` group.
- `recharts` added as a runtime dependency.

## [0.3.0] - 2026-06-24

### Added
- Celebration animation (confetti) on correct answers, with an `animationsEnabled` setting to disable it.
- Streak tracking: current streak shown in the game header (Animal Sounds, Color Match), all-time best streak persisted per game.
- Richer end-of-game session summary listing any missed items, or a "perfect run" message when none were missed.
- Per-question timing: each answer's response time (`durationMs`) is recorded and saved with the score for future analytics and personal-best displays.

### Changed
- Extracted the shared game-loop logic (queue building, answer/score state, results screen) out of `AnimalSoundsGame` and `ColorMatchGame` into a shared `useGameSession` hook and `GameResults` component.
