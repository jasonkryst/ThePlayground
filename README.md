# The Playground

A browser-based game dashboard designed for infants and toddlers. Games are displayed as large, tappable cards. Each game is self-contained in its own folder — adding a new game requires no changes to the core application.

## Features

- **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs; 64×64 px minimum tap targets throughout
- **Auto-discovered games** — drop a folder into `src/games/` and it appears on the dashboard automatically
- **Animal Sounds** — an animal sound plays automatically; the child picks the matching animal from picture buttons
- **Color Match** — a color swatch is shown; the child picks the matching colored object from picture buttons
- **Admin / Settings** — tabbed settings page (Settings · Games · History); configure child's name, answer choices (2–4), feedback mode, questions per session, Google Analytics ID, and per-game tag overrides
- **Persistent scoring** — game history stored in `localStorage`; swappable for a backend without touching game code
- **Version display** — app version shown in the dashboard footer; game version shown in the game header
- **Google Analytics** — optional GA4 tracking configured at runtime via the admin page; fires page view events on every React Router navigation

---

## Dashboard Features

### Daily Challenge

Each day, one game is automatically selected as "Today's Game" and displayed as a featured hero card above the game grid. The selection is deterministic (based on a date-seeded hash), so all users see the same featured game each day. This encourages daily return visits and variety in play.

### Recently Played Badges

When a game has been played, its card displays a colored glow border and a badge showing when it was last played:
- "Today · N plays" — played today
- "Yesterday · N plays" — played yesterday
- "N days ago · N plays" — played N days ago

This visual indicator comes from your existing score history with no additional storage needed.

### Game Categories & Tags

Games are now organized under category headings ("Sounds 🔊", "Visual 👁️", etc.) on the dashboard. A tab strip at the top of the dashboard lets parents filter by category to see only games in a particular group.

Each game's category is defined by a `"tags"` array in its `manifest.json` (required field, minimum one tag). Tags can be customized per-game in the admin panel under the **Games** tab, allowing you to reorganize games without modifying code.

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The dashboard appears immediately; tap any game card to play.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run tests in watch mode |
| `npm run coverage` | Run tests once and generate coverage report |

---

## Architecture

```
src/
├── App.jsx                    # Auto-discovery routing
├── index.css                  # Design system (CSS custom properties)
├── main.jsx                   # React entry point
│
├── components/                # Shared UI
│   ├── Dashboard.jsx          # Game card grid + admin link
│   ├── GameCard.jsx           # Individual game card
│   └── ScoreHistory.jsx       # Score list, used by AdminPage
│
├── admin/
│   └── AdminPage.jsx          # Settings page
│
├── hooks/
│   ├── useSettings.js         # Read/write settings via storage adapter
│   └── useScores.js           # Read/write scores via storage adapter
│
├── storage/
│   ├── adapter.js             # Interface definition + DEFAULT_SETTINGS
│   ├── localStorageAdapter.js # localStorage implementation
│   └── index.js               # Active adapter export (swap here for a backend)
│
└── games/
    └── animal-sounds/         # One folder per game
        ├── manifest.json      # Game metadata
        ├── index.jsx          # Game component
        ├── data/
        │   ├── animals.js     # Animal definitions
        │   └── sounds.js      # Vite asset glob for .mp3 URLs
        └── sounds/            # Audio files (.mp3)
```

### Auto-Discovery

`App.jsx` uses Vite's `import.meta.glob` to scan for games at build time:

```js
const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')
```

Every `manifest.json` becomes a dashboard card. Every `index.jsx` becomes a lazy-loaded route at `/game/<id>`. No imports, no registries — just files.

### Storage Adapter

All persistence goes through a four-method interface:

```js
getScores()           // → Promise<Score[]>
addScore(score)       // → Promise<void>
getSettings()         // → Promise<Settings>
saveSettings(settings)// → Promise<void>
```

The active adapter is exported from `src/storage/index.js`. To swap `localStorage` for Supabase, Firebase, or any other backend, implement those four methods and change that one export.

### Design Tokens

All colors and radii are CSS custom properties defined in `src/index.css`:

```css
--color-aqua:     #80DEEA
--color-teal:     #80CBC4
--color-lavender: #B39DDB
--color-lilac:    #CE93D8
--color-bg:       #F0FDFF
```

---

## Adding a New Game

1. Create a folder under `src/games/<your-game-id>/`
2. Add `manifest.json`:

```json
{
  "id": "your-game-id",
  "name": "Your Game Name",
  "description": "One sentence description.",
  "icon": "🎮",
  "color": "#80DEEA"
}
```

3. Add `index.jsx` with a default export that accepts `onGameEnd`:

```jsx
export default function YourGame({ onGameEnd }) {
  // call onGameEnd() when the session is complete
  return <div>Your game here</div>
}
```

That's it — the game appears on the dashboard and gets its own route automatically.

The game component receives settings via the `useSettings` hook and can persist scores via `useScores`:

```js
import useSettings from '../../hooks/useSettings'
import useScores   from '../../hooks/useScores'

const { settings } = useSettings()
const { addScore }  = useScores()
```

Score shape: `{ gameId, score, total, date, timestamp }`

---

## Docker

**Prerequisites:** Docker with Compose

```bash
docker compose up --build    # build image and start
docker compose up -d         # run in background after first build
```

App is served at [http://localhost:8080](http://localhost:8080).

The production image is a two-stage build: a Node LTS container compiles `dist/`, then a lean `nginx:alpine` container (~25 MB) serves the static files. `nginx.conf` includes an SPA fallback (`try_files`) so React Router routes like `/admin` and `/game/animal-sounds` work on direct navigation and page refresh.

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build definition |
| `nginx.conf` | SPA routing fallback, asset caching, security headers |
| `docker-compose.yml` | Single-service compose for local/self-hosted use |
| `.dockerignore` | Excludes `node_modules`, `dist`, `coverage`, tool state |

---

## Testing

The Playground has four layers of automated testing — unit/component (Vitest + RTL), accessibility audits (jest-axe + axe-core/playwright), end-to-end (Playwright), and visual regression (Storybook + Playwright screenshots) — all runnable locally with no external accounts. See [`docs/TESTING.md`](docs/TESTING.md) for the full reference, including how to run each layer and update visual baselines.

```bash
npm test          # unit/component tests, watch mode
npm run e2e        # end-to-end + accessibility + visual regression
npm run storybook  # browse component/game stories locally
```

---

## Settings Reference

Accessible from the dashboard via the gear icon (⚙).

| Setting | Default | Options |
|---|---|---|
| Child's Name | *(empty)* | Any text |
| Answer choices | 2 | 2, 3, 4 |
| Feedback mode | Immediate | Immediate, Parent tap |
| Questions per session | 10 | 5, 10, 15, 20 |
| Celebration animations | On | On, Off |
| Timer display | On | On, Off |
| Retry attempts | None | None, 1, 2, 3, 4, 5, Unlimited |
| Hints | Off | On, Off |
| Show hint after | 2 | 1, 2, 3, 4, 5 (only shown when Hints is On) |
| Retry counts toward streak | On | On, Off |
| Spaced repetition | Off | On, Off |
| Difficulty auto-progression | Off | On, Off |
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |

**Immediate** — correct/wrong feedback shown instantly; next question advances automatically after 1.5 s.

**Parent tap** — feedback shown after a parent taps "Next", giving time to discuss the answer.

**Google Analytics** — when a Measurement ID is entered, the GA4 script is injected at runtime and page view events fire on every navigation. Leaving the field blank disables tracking entirely. The ID is stored in `localStorage` alongside other settings.

**Child's Name** — when set, the dashboard title reads "<Name>'s Playground"; when left blank, it shows the default "Baby's Playground".

**Celebration animations** — when on, a confetti burst plays on every correct answer and the game header shows the current answer streak once it reaches 2; the end-of-game screen lists any missed items. Turning this off disables the confetti only — streak tracking and the missed-items summary remain.

**Timer display** — shows a running stopwatch next to the question, counting up from 0 each time a new question appears. Purely informational; there is no time limit today.

**Retry attempts** — how many wrong taps are allowed on a question before it locks in as missed. "None" reproduces the original behavior (locks on the very first wrong tap). Each wrong choice becomes disabled (but stays visible) so the child can try a different one.

**Hints** — when on, the correct answer is highlighted once the child has reached "Show hint after" wrong taps on the current question, without locking it.

**Retry counts toward streak** — when on, getting a question right after 1+ wrong taps still counts toward the answer streak. When off, a correct-after-retry still scores as correct but resets the streak to 0.

**Spaced repetition** — when on, a missed item reappears a few questions later in the same session (replacing one of the not-yet-asked items, so the session length stays the same).

**Difficulty auto-progression** — when on, finishing a session with a perfect score offers to raise Answer Choices by 1 (up to the maximum of 4) on the results screen.

---

## Versioning

The app version is read from `package.json` at build time (via Vite's JSON import) and displayed in the dashboard footer. Each game's version comes from its own `manifest.json` and is shown in the game header.

To release a new version, bump `version` in `package.json` and the relevant game `manifest.json` files, then rebuild.

---

## Animal Sounds Game

Animals: elephant, lion, cow, dog, cat, frog, duck, horse, pig, sheep, rooster, owl.

Sound files live in `src/games/animal-sounds/sounds/` and must be named `<animal>.mp3`. The game uses a Vite asset glob to resolve URLs at build time, so the paths are production-safe:

```js
// src/games/animal-sounds/data/sounds.js
const sounds = import.meta.glob('../sounds/*.mp3', { eager: true, query: '?url', import: 'default' })
```

Free CC0 animal sounds are available at [freesound.org](https://freesound.org).

---

## Future Enhancements

A tracked list of ideas for new games, UX improvements, scoring features, and technical work is maintained in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md).
