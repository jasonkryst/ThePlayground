# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
