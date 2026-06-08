# The Playground

A browser-based game dashboard designed for infants and toddlers. Games are displayed as large, tappable cards. Each game is self-contained in its own folder — adding a new game requires no changes to the core application.

## Features

- **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs; 64×64 px minimum tap targets throughout
- **Auto-discovered games** — drop a folder into `src/games/` and it appears on the dashboard automatically
- **Animal Sounds** — an animal sound plays automatically; the child picks the matching animal from picture buttons
- **Admin / Settings** — configure answer choices (2–4), feedback mode, and questions per session
- **Persistent scoring** — game history stored in `localStorage`; swappable for a backend without touching game code

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

Tests live alongside the code they test in `__tests__/` folders. The stack is **Vitest + React Testing Library + jsdom**.

```bash
npm test          # watch mode
npm run coverage  # single run with coverage report
```

**Current coverage:** 53 tests across 10 files; hooks, shared components, and storage adapter at 100%.

A few patterns used in this codebase worth knowing:

- **Fake timers:** Tests that cover timed feedback (correct/wrong answer delays) use `vi.useFakeTimers()` with `fireEvent` rather than `userEvent` — `userEvent` deadlocks with fake timers in this stack.
- **Mocking the adapter:** Hook tests mock `src/storage/index.js` via `vi.mock()` with `vi.hoisted()` so mock initialization runs before the hoisted mock call.
- **`data-testid` for game internals:** The game component exposes `data-testid="correct-animal-id"` on a hidden span so tests can assert which answer is correct without coupling to display order.

---

## Settings Reference

Accessible from the dashboard via the gear icon (⚙).

| Setting | Default | Options |
|---|---|---|
| Answer choices | 2 | 2, 3, 4 |
| Feedback mode | Immediate | Immediate, Parent tap |
| Questions per session | 10 | 5, 10, 15, 20 |

**Immediate** — correct/wrong feedback shown instantly; next question advances automatically after 1.5 s.

**Parent tap** — feedback shown after a parent taps "Next", giving time to discuss the answer.

---

## Animal Sounds Game

Animals: elephant, lion, cow, dog, cat, frog, duck, horse, pig, sheep, rooster, owl.

Sound files live in `src/games/animal-sounds/sounds/` and must be named `<animal>.mp3`. The game uses a Vite asset glob to resolve URLs at build time, so the paths are production-safe:

```js
// src/games/animal-sounds/data/sounds.js
const sounds = import.meta.glob('../sounds/*.mp3', { eager: true, query: '?url', import: 'default' })
```

Free CC0 animal sounds are available at [freesound.org](https://freesound.org).
