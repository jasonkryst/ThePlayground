# Potential Enhancements

Ideas for future development. Not committed to any timeline.

---

## Games

### New Game Types
- **Shape Sort** — present a shape name/picture, child picks the correct shape
- **Number Tap** — display a number (1–10), child taps that many objects on screen
- **Alphabet Sounds** — play a letter sound (phonics), child picks the correct letter
- **Fruit & Veggie ID** — picture of a fruit/vegetable plays its name, child matches it

### Animal Sounds Improvements
- Expand the animal roster beyond 12 (zebra, bear, penguin, monkey, etc.)
- Add difficulty levels: easy (2 choices, common animals), hard (4 choices, similar-sounding animals)
- Show the animal name as text after a correct answer to reinforce reading
- Add a "practice mode" where wrong answers repeat the question rather than moving on

---

## Gameplay & UX

- **Hint system** — after two wrong taps on the same question, highlight the correct answer
- **Sound replay on wrong answer** — auto-replay the sound when the child picks incorrectly
- **Parental lock on settings** — require a simple PIN or gesture to open the admin page

---

## Dashboard

- **Recently played** — show a "last played" badge on game cards
- **Game categories / tags** — group cards by type (sounds, visual, numbers) when the library grows
- **Drag to reorder** — let parents arrange game cards by preference
- **Daily challenge** — highlight one game per day as the featured game

---

## Scoring & Progress

- **Per-child profiles** — support multiple child accounts with separate score histories
- **Progress charts** — simple bar or line chart in the admin page showing score trends over time
- **Milestone badges** — award badges for streaks, perfect sessions, or total questions answered
- **Export scores** — download score history as CSV from the admin page

---

## Backend / Sync

- **Cloud sync** — swap the localStorage adapter for a Supabase or Firebase adapter so scores follow the child across devices (the adapter pattern is already designed for this)
- **Offline-first PWA** — add a service worker and web app manifest so the app installs to the home screen and works without a network connection
- **Parent dashboard** — separate web view (or route) with richer analytics, accessible from a different URL

---

## Technical

- **PWA / installable** — `vite-plugin-pwa` to generate a service worker and `manifest.webmanifest` for home-screen install
- **CI pipeline** — GitHub Actions workflow to run `npm test`, `npm run build`, and Docker build on every push
