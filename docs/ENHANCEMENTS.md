# Potential Enhancements

Ideas for future development. Not committed to any timeline.

Completed work is recorded in `CHANGELOG.md` — entries here are removed once they ship. Each entry carries a one-line rationale so the "why" survives until someone picks it up.

Organized by the improvement categories from issue #61: UI, UX, accessibility, game features, new games, security, testing layers, and backend/sync.

---

## Standards & Accessibility (audit status)

Everything from the 2026-07-05 standards audit is resolved (shipped across v0.13.0–v0.16.0 — see `CHANGELOG.md`); `docs/superpowers/plans/2026-07-05-standards-audit-remediation.md` keeps the item-by-item record.

- **Informational, no action:** the app's opt-in Google Analytics integration has no COPPA exposure while self-hosted and GA-off-by-default; revisit only if this is ever distributed to other families with GA switched on. (This analysis is also recorded in `SECURITY.md`.)

---

## UI

- **Dark mode** — every color already routes through the CSS custom properties in `src/index.css`, so a `prefers-color-scheme: dark` token layer (plus a manual override in admin) is cheap to add and instantly consistent across all games; evening/wind-down use is common for this audience.
- **Per-game-type results theming** — the shared `GameResults` screen is deliberately generic; a light theming hook (accent color from the game's manifest `color`, game-type-appropriate stat labels) would make results feel like part of each game without forking the component.
- **Drag to reorder** — let parents arrange game cards by preference; the dashboard currently orders by category and discovery order, which stops being ideal once the catalog grows.

## UX

- **Sound replay on wrong answer** — auto-replay the sound when the child picks incorrectly (Animal Sounds); a child who mis-taps often never re-hears the prompt they were matching against.
- **Practice mode** — wrong answers repeat the question rather than moving on; removes session pressure for the youngest users who are still learning the mechanic itself.
- **Parental lock on settings** — require a simple PIN or gesture to open the admin page; a toddler exploring the screen can currently reach and change settings. (Cross-listed under Security.)
- **Session resume after interruption** — the exit guard (v0.18.0) stops accidental exits, but a browser crash, tab close, or reload still loses an in-progress session; persisting minimal session state would let it offer "pick up where you left off."
- **Honor the tap-target standard on the dashboard tab strip (AU-7)** — `.dashboard__tab` is ~33 px tall (`padding: 6px 16px`), which passes WCAG 2.5.8 but contradicts the README's "64×64 px minimum tap targets throughout" claim, on the home screen a child is most likely to be handling. Raise the strip to ≥44 px (regenerate visual baselines) — or, second-best, scope the README claim to child-facing game surfaces; the claim-vs-reality gap is the defect. (From `docs/accessibility_usability.md`.)
- **Visible recovery when audio autoplay is blocked (AU-8)** — `useSoundPlayer.play()` deliberately swallows `audio.play()` rejections, so a blocked autoplay leaves an Animal Sounds question with no prompt and no cue; surface the rejection and pulse the 🔊 replay button with a localized "tap to hear" hint until first successful playback. (From `docs/accessibility_usability.md`.)

## Accessibility

Items marked **AU-n** come from the 2026-07-12 a11y/i18n/UX audit (`docs/accessibility_usability.md`), which found zero automated-scan violations — these are the judgment-level gaps automation can't see. (That audit also verified the memory board's reduced-motion coverage is already complete, so the previous "reduced-motion audit for the memory board" entry is resolved and removed.)

- **Non-color quiz feedback (AU-1, WCAG 1.4.1)** — `.correct`/`.wrong`/`.highlight-correct` are background-color-only (green vs red of similar lightness — the classic CVD-confusable pair), and the pulse/shake secondary cue is disabled under `prefers-reduced-motion`. Add an `aria-hidden` ✓/✗ glyph (and/or outline) in `GameChoiceGrid` so all three quiz games inherit three-signal feedback — the memory board's mismatch state (✗ + outline + color) is the in-repo model.
- **Keep keyboard focus on quiz choices (AU-3)** — `GameChoiceGrid` uses real `disabled`, dropping focus to `<body>` when the focused choice locks; mirror the v0.23.0 memory-tile fix (`aria-disabled` + click guard).
- **Localize score-history dates (AU-6, i18n)** — `ScoreHistory.jsx` renders the raw ISO `YYYY-MM-DD` string; format via `Intl.DateTimeFormat(i18n.language, …)` (parsing the ISO string as a *local* date to avoid the UTC day-shift trap).
- **Full RTL support (`dir` attribute sync)** — the remaining half of RTL readiness (logical CSS properties already shipped in v0.16.0); requires an actual RTL locale to exist before it can be meaningfully verified. (Re-confirmed outstanding by the 2026-07-12 audit: `lang` syncs, `dir` doesn't.)
- **200% zoom / large-text audit** — verify layouts (especially the memory board and results screens) survive browser zoom and OS large-text settings; this audience's parents often hand devices to grandparents.
- **Switch-access exploration** — the target audience overlaps with early-intervention users; investigating single-switch scanning support (sequential focus + one activation input) would widen who can play.
- **Real assistive-technology pass** — one NVDA or VoiceOver session through a full game loop (AU-2 landed in v0.26.0; known gap for that pass: consecutive same-type events render identical live-region text, so screen readers may not re-announce the second of two correct answers in a row — the memory game's mismatch announcement shares this property); static audits and axe can't judge announcement verbosity or pronunciation.

## Game Features

- **Difficulty levels per game** — easy (2 choices, common items) vs hard (4 choices, similar-sounding/looking items); item pools tagged by difficulty. Originally proposed for Animal Sounds; the mechanism generalizes to every quiz game.
- **Show the item name after a correct answer** — reinforces early reading (originally an Animal Sounds idea; applies to all quiz games).
- **Expand the animal roster beyond 12** — zebra, bear, penguin, monkey, etc.; more variety per session at the cost of sourcing CC0 sounds.
- **Per-game settings overrides** — e.g. run Character Match at 4 choices while Animal Sounds stays at 2; today all quiz games share one `numChoices`, which forces the difficulty to the weakest game.
- **Cross-session adaptive item selection** — weight item queues toward items missed in *previous* sessions; today's spaced repetition (v0.6.0) only re-asks within the same session, so a consistently confused item gets no long-term reinforcement.

## New Games

Quiz-type (all get the engine's retries, hints, timers, badges, and personal bests for free):

- **Shape Sort** — present a shape name/picture, child picks the correct shape; foundational geometry vocabulary.
- **Number Tap** — display a number (1–5), child taps that many objects on screen; builds early counting.
- **Alphabet Sounds** — play a letter sound (phonics), child picks the correct letter card; pre-reading phonemic awareness.
- **Fruit & Veggie ID** — picture of a fruit/vegetable plays its name, child matches it; everyday-object vocabulary.
- **Big or Small** — show two objects side by side, child taps the bigger (or smaller) one; builds spatial reasoning.
- **Emotions Match** — show an emotion word ("happy", "sad"), child picks the matching face; builds emotional vocabulary.
- **Body Parts** — "Where's your nose?" with a cartoon figure; child taps the correct body part; receptive language staple.
- **Simple Patterns** — show a color/shape sequence with one item missing, child picks what comes next; early sequencing/logic.
- **First Words** — a picture is shown and its word is spoken; the child picks the matching picture from spoken-word prompts; receptive vocabulary for pre-verbal children.
- **Same or Different** — two pictures, one binary choice; the simplest possible mechanic, reachable by the youngest users before multi-choice games make sense.

Memory-type (exercise the v0.23.0 memory engine — `useMemorySession`, `MemoryBoard`, `buildDeck` — beyond its single current game):

- **Sound Memory Match** — tiles play sounds instead of showing pictures when flipped; matching by ear combines the memory engine with the shared sound library and adds an auditory-memory dimension no current game has.

## Security

Mirrors the "known gaps" in `SECURITY.md` — each of these is acknowledged there and tracked here. Items marked **SEC-n** come from the 2026-07-12 full security audit (`docs/superpowers/specs/2026-07-12-security-audit-findings.md`), which found no HIGH-severity issues:

- ~~**Fix nginx security-header inheritance (SEC-1, Medium)**~~ — done (issue #84): the three headers now live in a shared `nginx/security-headers.conf`, `include`d in the `server` block and both asset `location` blocks (each also gained `always`, so headers survive error responses too), guarded by a static config test plus a live e2e Docker header assertion.
- **Content-Security-Policy rollout (SEC-2)** — the strongest structural XSS defense; the audit includes a concrete starter policy (GA script/connect sources, `style-src 'unsafe-inline'` for the app's legitimate per-item inline styles, `object-src 'none'`, `frame-ancestors 'self'`) to iterate from with e2e verification, not a bolted-on header.
- **`Permissions-Policy` + `server_tokens off` (SEC-3)** — deny camera/microphone/geolocation/payment outright (the app uses none; free hardening against any future third-party script) and stop advertising the nginx version. Add the `Permissions-Policy` line to `nginx/security-headers.conf` alongside the other three so it's automatically covered everywhere they are; `server_tokens off` goes in the `server` block (inheritance doesn't apply to it — it's not an `add_header`).
- **Harden the CSV builder (SEC-5)** — `buildCsvContent` (`src/utils/dashboardUtils.js`) does no RFC 4180 quoting or formula-prefix escaping; safe with today's all-app-generated fields, but the first free-text column added to the export (child name, user-created content) becomes spreadsheet formula injection. Quote every field, prefix-escape `=`/`+`/`-`/`@`, add hostile-input unit tests now while the function is small.
- **PIN gate for `/admin` and `/parent`** — same as the UX parental-lock entry; listed here because it's also the only access control the app would have.
- **`npm audit` in CI** — dependency vulnerabilities are currently caught only when someone runs the audit manually; a CI gate makes it continuous. Gate on `--omit=dev` (fail on production-tree findings; report-only for the dev tree — the 2026-07-12 audit found the prod tree clean and 3 moderate dev-only advisories in the Storybook 8 chain, SEC-6, not worth a breaking downgrade). (Depends on the CI pipeline below.)
- ~~**Container hardening — non-root nginx + pinned base images (SEC-4)**~~ — done (issue #85): the runtime image switched to `nginxinc/nginx-unprivileged:1.27-alpine` (non-root `nginx` user, uid 101; compose port mapping adjusted to `8080:8080` since unprivileged nginx can't bind port 80), and both base images (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) are pinned to a major.minor version instead of a floating tag. Guarded by a static Dockerfile pin/non-root test (`nginx/__tests__/securityHeaders.test.js`) and a live e2e check (`e2e/nginx-headers.spec.js`) that boots the real pinned image and asserts the nginx process is non-root.
- **Image vulnerability scanning (SEC-4 remainder)** — add automated scanning (e.g. Trivy) once a CI pipeline exists to run it.
- **Subresource integrity for the GA loader** — noted for completeness with honest caveats: the gtag URL serves Google-rotated content, so SRI would break on their rotation; a CSP `script-src` allowlist is the practical control instead.

## Testing Layers

- **CI pipeline** — GitHub Actions workflow running `npm run lint`, `npm run lint:css`, `npm test`, `npm run build`, `npm run e2e`, and the Docker build on every push; today the six local layers only protect a developer who remembers to run them.
- **Lighthouse budgets in CI** — automated performance/accessibility scoring per route with regression thresholds; complements axe (which checks violations, not degradation trends). (Depends on the CI pipeline.)

## Backend / Sync

- **Cloud sync** — swap the localStorage adapter for a Supabase or Firebase adapter so scores follow the child across devices; the ten-method adapter interface was designed for exactly this swap (see `README.md` § Storage Adapter), and the contract test above would gate it.
- **Per-child profiles** — support multiple child accounts with separate score histories; the storage shapes are keyed by game today, so profiles are a schema evolution best paired with the adapter/backend work.
- **Parent Dashboard enhancements** — game-name labels in charts, PIN protection for the `/parent` route (the interactive date-range filter and heatmap month labels shipped in v0.21.0).

## PWA / Installable

- **Offline-first PWA** — `vite-plugin-pwa` to generate a service worker and `manifest.webmanifest` so the app installs to the home screen and works without a network connection; a static SPA with localStorage persistence is the ideal PWA candidate, and car/travel use is a natural fit for this audience.
