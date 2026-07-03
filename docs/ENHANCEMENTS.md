# Potential Enhancements

Ideas for future development. Not committed to any timeline.

---

## Recently Completed

### v0.7.0 — How-to-Play Intro Screens (2026-07-02)
- **How-to-play intro screens** (issue #13) — a core engine mechanic in `useGameSession` that shows a `GameIntro` screen (icon, name, instructions) before a game's first question on initial mount; skipped on subsequent "Play Again" rounds in the same visit
- **"Don't show this again"** checkbox permanently suppresses a game's intro via the new `introDismissed` setting
- **"Replay Intro"** admin control (Games tab) clears a game's dismissed flag

### v0.6.0 — Game Engine Core (2026-07-01)
- **Timer display** — running stopwatch shown next to each question, togglable in admin settings
- **Retry attempts (maxTries)** — configurable number of wrong taps allowed before a question locks in as missed
- **Hint system** — highlights the correct answer after a configurable number of wrong taps, without locking the question
- **Spaced repetition queue** — missed items reappear a few questions later in the same session
- **Difficulty auto-progression** — offers to raise the number of answer choices by 1 after a perfect session

### v0.5.0 — Dashboard Enhancements (2026-06-30)
- **Recently Played badge** — GameCards show a glow highlight and "Today · N plays" badge for games played today, yesterday, or within the past week
- **Daily Challenge hero card** — date-seeded featured game shown above the dashboard grid each day; hidden when a category filter is active
- **Game Categories / Tags** — each game manifest has a required `tags` field; filter tab strip (All · Sounds · Visual · …) and labeled section groupings in the All view
- **AdminPage tag editor** — parents can override per-game tags from a new tabbed AdminPage (Settings / Games / History)
- **Tabbed AdminPage layout** — settings, game tag editor, and score history split into three tabs
- **`--color-error` design token** and accessibility contrast improvements (active tabs, featured card label, error colors)

### v0.4.0 — Parent Progress Dashboard (2026-06-28)
- **`/parent` route** — standalone progress dashboard linked via 📊 button on the main dashboard
- **Score trend chart** — Recharts LineChart of correct-answer rates per game over time
- **Response-time chart** — average `durationMs` per question per game plotted over time
- **Streak history table** — peak streaks per game for the last 7 days, 30 days, and all-time
- **Play calendar heatmap** — 13-week GitHub-style grid; cell intensity = questions answered that day
- **Missed-items breakdown** — horizontal bar chart of most-missed animals/colors per game (requires sessions recorded after v0.4.0)
- **Export to CSV** — downloads full score history with accuracy %, avg response time, and peak streak
- Score records now include `peakStreak` and timing entries now include `itemId` (both backward-compatible)

### v0.3.0 — In-Game Feedback (2026-06-28)
- **Celebration animations** — confetti burst on every correct answer; `animationsEnabled` admin toggle to disable
- **Streak tracking** — current streak shown in game header (visible at ≥ 2), all-time best streak persisted per game in localStorage
- **Session summary** — end-of-game screen lists missed items with their emoji/swatch, or shows "Perfect run! 🎉" when none were missed
- **Shared game engine** — `useGameSession` hook and `buildQueue` util extracted from both games; adding a new game now requires ~zero boilerplate
- **Per-question timing** — `durationMs` recorded silently per answer and saved with each score (ready for analytics/display)
- **ESLint v9 flat config** — `eslint.config.js` added; `react-hooks/exhaustive-deps` warnings resolved

### v0.2.0 — Technical Test Harness
- Vitest + React Testing Library unit tests, jest-axe accessibility assertions, Playwright E2E and visual regression, Storybook component stories

### v0.1.0 — Initial Platform
- Auto-discovery plugin system, Ocean & Dream theme, Animal Sounds and Color Match games, admin settings, localStorage adapter, score history, i18n

---

## Games

### New Game Types
- **Animal Memory Match** — 10 face-down tiles (5 animal pairs); child flips two at a time. Matching pair: brief confetti burst and tiles stay revealed. Non-matching pair: tiles highlight red then flip back over. Reveal all 5 pairs: full fireworks animation.
- **Shape Sort** — present a shape name/picture, child picks the correct shape
- **Number Tap** — display a number (1–5), child taps that many objects on screen; builds early counting
- **Alphabet Sounds** — play a letter sound (phonics), child picks the correct letter card
- **Fruit & Veggie ID** — picture of a fruit/vegetable plays its name, child matches it
- **Big or Small** — show two objects side by side, child taps the bigger (or smaller) one; builds spatial reasoning
- **Emotions Match** — show an emotion word ("happy", "sad"), child picks the matching face; builds emotional vocabulary
- **Body Parts** — "Where's your nose?" with a cartoon figure; child taps the correct body part
- **Simple Patterns** — show a color/shape sequence with one item missing, child picks what comes next

### Animal Sounds Improvements
- Expand the animal roster beyond 12 (zebra, bear, penguin, monkey, etc.)
- Add difficulty levels: easy (2 choices, common animals), hard (4 choices, similar-sounding animals)
- Show the animal name as text after a correct answer to reinforce reading
- Add a "practice mode" where wrong answers repeat the question rather than moving on

---

## Core Game Engine

- **Answer within N seconds** — enforce `timeLimitMs`/`onTimeout` (already wired as unused parameters in `useGameSession`, reserved during the v0.6.0 timer work) as a configurable per-question time limit, pairing with the existing timer display
- **Sound effects layer** — shared audio feedback (chime on correct, low tone on wrong) independent of game-specific audio; configurable in admin alongside animations
- **Per-session "personal best"** — compare the current session's score and speed against the stored best; show a "New record!" banner on the results screen using the `timings` data already saved

---

## Gameplay & UX

- **Sound replay on wrong answer** — auto-replay the sound when the child picks incorrectly (Animal Sounds)
- **Parental lock on settings** — require a simple PIN or gesture to open the admin page

---

## Dashboard

- **Drag to reorder** — let parents arrange game cards by preference

---

## Scoring & Progress

- **Milestone badges** — award badges for streaks, perfect sessions, or total questions answered
- **Per-child profiles** — support multiple child accounts with separate score histories
- **Parent Dashboard enhancements** — interactive date-range filter, game-name labels in charts, month labels on the heatmap, PIN protection for the `/parent` route

---

## Backend / Sync

- **Cloud sync** — swap the localStorage adapter for a Supabase or Firebase adapter so scores follow the child across devices (the adapter pattern is already designed for this)
- **Offline-first PWA** — add a service worker and web app manifest so the app installs to the home screen and works without a network connection

---

## Technical

- **PWA / installable** — `vite-plugin-pwa` to generate a service worker and `manifest.webmanifest` for home-screen install
- **CI pipeline** — GitHub Actions workflow to run `npm test`, `npm run build`, and Docker build on every push
