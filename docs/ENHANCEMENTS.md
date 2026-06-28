# Potential Enhancements

Ideas for future development. Not committed to any timeline.

---

## Recently Completed

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

- **Timer display** — surface `currentElapsedMs` from `useGameSession` as a progress bar or countdown; the data is already captured, just needs a UI component
- **Spaced repetition queue** — weight `buildQueue` to re-ask recently missed items more often within a session, rather than a pure random shuffle
- **Difficulty auto-progression** — after a perfect session, automatically offer to increase `numChoices` by 1 (up to the max); gives a natural growth curve
- **Hint system** — after two wrong taps on the same question, highlight the correct answer; `useGameSession` already tracks `answered` state to key off
- **Sound effects layer** — shared audio feedback (chime on correct, low tone on wrong) independent of game-specific audio; configurable in admin alongside animations
- **Per-session "personal best"** — compare the current session's score and speed against the stored best; show a "New record!" banner on the results screen using the `timings` data already saved

---

## Gameplay & UX

- **Sound replay on wrong answer** — auto-replay the sound when the child picks incorrectly (Animal Sounds)
- **Parental lock on settings** — require a simple PIN or gesture to open the admin page

---

## Dashboard

- **Recently played** — show a "last played" badge on game cards
- **Game categories / tags** — group cards by type (sounds, visual, numbers) when the library grows
- **Drag to reorder** — let parents arrange game cards by preference
- **Daily challenge** — highlight one game per day as the featured game

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
