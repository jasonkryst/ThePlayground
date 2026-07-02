# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
