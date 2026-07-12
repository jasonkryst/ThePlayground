# Potential Enhancements

Ideas for future development. Not committed to any timeline.

Completed work is recorded in `CHANGELOG.md` — entries here are removed once they ship.

---

## Standards & Accessibility

Everything from the 2026-07-05 standards audit is resolved (shipped across v0.13.0–v0.16.0 — see `CHANGELOG.md`); `docs/superpowers/plans/2026-07-05-standards-audit-remediation.md` keeps the item-by-item record.

- **Full RTL support (`dir` attribute sync)** — the remaining half of RTL readiness (logical CSS properties already shipped in v0.16.0); requires an actual RTL locale to exist before it can be meaningfully verified
- **Informational, no action:** the app's opt-in Google Analytics integration has no COPPA exposure while self-hosted and GA-off-by-default; revisit only if this is ever distributed to other families with GA switched on

---

## Games

### New Game Types
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

- **Sound effects layer** — shared audio feedback (chime on correct, low tone on wrong) independent of game-specific audio; configurable in admin alongside animations. Partially in place since v0.23.0: the `soundEffectsEnabled` setting and shared sound library (`src/assets/sounds`) exist, but only memory games use them — the correct/wrong chime layer for quiz games remains.

---

## Gameplay & UX

- **Sound replay on wrong answer** — auto-replay the sound when the child picks incorrectly (Animal Sounds)
- **Parental lock on settings** — require a simple PIN or gesture to open the admin page

---

## Dashboard

- **Drag to reorder** — let parents arrange game cards by preference

---

## Scoring & Progress

- **Per-child profiles** — support multiple child accounts with separate score histories
- **Parent Dashboard enhancements** — game-name labels in charts, PIN protection for the `/parent` route (the interactive date-range filter and heatmap month labels shipped in v0.21.0)

---

## Backend / Sync

- **Cloud sync** — swap the localStorage adapter for a Supabase or Firebase adapter so scores follow the child across devices (the adapter pattern is already designed for this)
- **Offline-first PWA** — add a service worker and web app manifest so the app installs to the home screen and works without a network connection

---

## Technical

- **PWA / installable** — `vite-plugin-pwa` to generate a service worker and `manifest.webmanifest` for home-screen install
- **CI pipeline** — GitHub Actions workflow to run `npm test`, `npm run build`, and Docker build on every push
- **Tighten the Playwright visual suite's `maxDiffPixelRatio`** (currently 0.1) — during the issue-#53 work a fully unstyled `GameResults` screen passed against styled baselines, so the tolerance cannot catch missing-stylesheet regressions (the e2e computed-style test in `animal-memory-match.spec.js` is the current guard). Re-validate flakiness on local disk before tightening (the tolerance predates the repo's move off the network share).
