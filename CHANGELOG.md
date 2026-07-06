# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
