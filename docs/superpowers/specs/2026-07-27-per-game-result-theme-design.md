# Per-Game Result Theme (Issue #92)

## Problem

`GameResults` (`src/components/GameResults.jsx`) is the shared results screen rendered at the end of every game, quiz and memory alike. It is deliberately generic — same colors, same "You scored X out of Y!" wording — regardless of which game produced it. That genericness is by design (one component, no forking), but it means results never feel like part of the specific game a child just played, and the wording doesn't fit memory games (which match pairs, not answer questions).

## Goals / non-goals

**Goals:** a *light* theming hook — accent color pulled from the game's own `manifest.color`, and a stat headline that reads correctly for the game type actually played — without forking `GameResults` per game or coupling it to `manifest`'s shape.

**Non-goals:** no per-game restyling of buttons, badges, or personal-best banners; no new settings/config; no theming of `GameIntro` (out of scope for issue #92, which names `GameResults` specifically); no gameType-specific handling beyond quiz vs. memory (the only two `gameType` values that exist today per `CLAUDE.md`).

## Existing precedent

`manifest.color` (a hex string every manifest already carries, e.g. `"#4DB6AC"`) is already consumed once, in `src/kids/KidsProgressPage.jsx`:

```jsx
style={{ borderTop: `6px solid ${manifest.color}` }}
```

A plain inline style, applied directly, no CSS custom property, no theme-token involvement. This works safely across Light/Dark/High-Contrast because it's purely decorative (a border, never text-on-fill), so it carries no WCAG text-contrast obligation — unlike, say, using the color as a button background with white text, which would need a per-color contrast check against three themes (and several manifest colors, e.g. `#B39DDB`, would fail AA at that weight). This design reuses that exact technique rather than introducing a new one.

`manifest.gameType` (`"memory"` for the one memory game today, absent/undefined for quiz games) is already consumed the same way, also in `KidsProgressPage.jsx`, to switch between accuracy-based and flips-based stat presentation. This design reuses that same discriminator for the results headline.

## Architecture

`GameResults` gains two new optional props. It stays decoupled from `manifest`'s shape (matching `GameIntro`'s existing decomposed-prop style, e.g. `icon`/`name`/`orientation` rather than a `manifest` object) — callers do the decomposition, exactly as `QuizGameShell` already does when it hands `manifest.icon`/`manifest.nameKey`/`manifest.orientation` to `GameIntro`.

```jsx
export default function GameResults({
  score, total, missed, onPlayAgain, onHome, renderMissedItem,
  offerDifficultyBump = false, numChoices, onAcceptDifficultyBump, onDismissDifficultyBump,
  personalBestResult = null, newBadges = [],
  accentColor, gameType,
}) { ... }
```

Both props are optional and additive — omitting them (every existing caller, until wired) renders byte-identical output to today.

### Visual accent

Two inline-style hooks, both gated on `accentColor` being truthy so the unthemed path never adds any style attribute at all:

- Root `.results` div: `style={{ borderTop: '6px solid ' + accentColor }}` — same technique as `KidsProgressPage`.
- `.results__emoji` div: a colored ring around the 🎉/⭐ glyph — `style={{ border: '4px solid ' + accentColor, borderRadius: '50%', padding: '10px' }}`. Exact padding/border-width will be confirmed visually in Storybook before the baseline screenshot is captured (childproofing the number now against a screenshot nobody's looked at yet).

No changes to `GameResults.css`. No CSS custom properties.

### Stat headline

```jsx
const scoreLabelKey = gameType === 'memory' ? 'common.scoreLabelMemory' : 'common.scoreLabel'
...
<div className="results__label">{t(scoreLabelKey, { score, total })}</div>
```

Any `gameType` other than `'memory'` (including `undefined`, today's default for every quiz game) falls through to the existing `common.scoreLabel` — no behavior change for quiz games.

New key, added to all three locale files (`en.json`, `es.json`, `pl.json`) to satisfy the existing cross-locale parity test:

| Locale | `common.scoreLabelMemory` |
|---|---|
| en | `You found {{score}} out of {{total}} pairs!` |
| es | `¡Encontraste {{score}} de {{total}} pares!` |
| pl | `Znaleziono {{score}} z {{total}} par!` |

Not pluralization-suffixed (no `_one`/`_other`/etc.), matching the existing unsuffixed `common.scoreLabel` it sits beside — introducing suffixes on only the new sibling key would be an inconsistency, not an improvement, and fixing `scoreLabel`'s own suffix gap is unrelated pre-existing scope.

Everything else on the results screen (`perfectRun`, `missedHeading`, personal-best banners) is unchanged: memory games always pass `missed={[]}` and `score === total` on completion already, so the perfect-run branch and the personal-best banners (which already branch on `fewestFlips`/`fastestMs` vs. `accuracy`/`speed` shape, not on a `gameType` prop) need no new game-type awareness.

### Wiring

Both existing call sites already have `manifest` in scope:

- `src/components/QuizGameShell.jsx` — add `accentColor={manifest.color}` and `gameType={manifest.gameType}` to its `<GameResults>` call (used by every quiz game: Animal Sounds, Character Match, Character Match Bluey, Color Match, Fruit & Veggie ID).
- `src/games/animal-memory-match/index.jsx` — same two props added to its direct `<GameResults>` call.

No other game currently renders `GameResults` outside these two paths.

## Docs to update

- `CLAUDE.md` — add a short clause documenting `manifest.color` as a real, consumed convention (currently undocumented despite `KidsProgressPage` already using it, and now doubly-used by `GameResults`).
- `docs/ENHANCEMENTS.md` — remove the "Per-game-type results theming" backlog bullet (implemented by this issue).
- `CHANGELOG.md` — new entry; bump `package.json` version (patch/minor, per existing convention for shared-engine changes).
- `README.md` — no structural change needed; existing results-screen mention stays accurate.

## Testing plan (positive + negative, all applicable layers)

**Unit (`src/components/__tests__/GameResults.test.jsx` additions):**
- Positive: `accentColor` given → `.results` has a `borderTop` inline style containing the color; `.results__emoji` has a `border`/`borderRadius` inline style containing the color.
- Negative: `accentColor` omitted → neither element has any `style` attribute added (verifies the conditional, not just that *a* style exists).
- Positive: `gameType="memory"` → the memory-phrased headline text renders (`"You found 4 out of 5 pairs!"` for `score=4 total=5`).
- Negative: `gameType` omitted, and separately `gameType="quiz"` (or any non-`"memory"` string) → the existing `scoreLabel` text renders, not the memory variant.
- a11y: `jest-axe` pass with both `accentColor` and `gameType="memory"` set together, plus the existing all-banners a11y test extended to also pass `accentColor` (decorative border/ring must not trip `color-contrast` or any other axe rule).

**Prop-forwarding (existing suites, additions):**
- `src/components/__tests__/QuizGameShell.test.jsx`: positive — rendering with a `manifest` that has `color`/`gameType` set results in `GameResults` receiving them (assert via the rendered accent style or a light component mock, whichever the existing test harness pattern uses elsewhere in this file).
- `src/games/animal-memory-match/__tests__/AnimalMemoryMatchGame.test.jsx`: same positive check for the direct `GameResults` call, asserting `gameType="memory"`'s wording actually shows up on that game's real results screen (not just in the unit-level `GameResults` test).

**i18n:** `src/i18n/__tests__/i18n.test.js`'s existing cross-locale key-parity check picks up `common.scoreLabelMemory` automatically once added to `en.json`/`es.json`/`pl.json` — a missing translation in any one locale fails it (implicit negative coverage), no new test needed.

**Visual regression (Storybook + `e2e/visual.spec.js`):**
- New stories in `GameResults.stories.jsx`: `WithAccent` (Light), `WithAccentDark`, `WithAccentHighContrast` (accent color set, default quiz wording), `MemoryPerfectRun` (`gameType="memory"`, no accent — isolates the wording change from the color change so a future diff in either doesn't muddy the other's baseline).
- Existing stories (`PerfectRun`, `PerfectRunDark`, `PerfectRunHighContrast`, etc.) stay unchanged — no `accentColor`/`gameType` added to them, so their baselines require no regeneration.
- All four new story IDs added to `e2e/visual.spec.js`'s fixed `stories` array, with fresh baseline PNGs captured via `npx playwright test visual.spec.js --update-snapshots` and reviewed before committing.

**Manual verification:** `npm run storybook`, visually confirm the emoji-ring sizing/padding reads as a clean circle (not an oval or clipped glyph) before locking in the exact padding value and capturing baselines.

No new CSS validation surface (Layer 6) beyond what `e2e/css-validity.spec.js` already covers generically for any inline `style={{...}}` — the new styles are plain, valid `border`/`border-top`/`border-radius`/`padding` declarations, same class of thing `KidsProgressPage`'s existing inline style already exercises. No HTML5 validation impact (no new elements, no `no-inline-style` exception needed beyond the one already carved out for per-item dynamic colors).
