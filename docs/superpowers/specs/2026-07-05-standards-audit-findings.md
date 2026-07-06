# Standards Audit — Findings

Date: 2026-07-05
Status: Findings (no code changed by this pass)
Branch audited: `accessibility`

## Context

A combined audit across W3C HTML5/CSS3 validity, WCAG 2.2 AA accessibility, internationalization, usability, and code-quality tooling, run against the `accessibility` branch as it stood on 2026-07-05. This is the sibling document to `2026-07-05-accessibility-i18n-hardening-design.md` — that spec named a list of fixes as done; this audit independently re-verified each one against the live running app and source, rather than trusting the document, and additionally covered ground the hardening spec didn't scope (HTML5/CSS3 validity, usability heuristics, code-quality tooling, and a flag on child-directed compliance).

The companion remediation plan is `docs/superpowers/plans/2026-07-05-standards-audit-remediation.md`.

## Methodology & limitations

Four passes were run in parallel:

1. **Automated suite** — `npm run lint`, `npm test`, `npm run coverage`, `npm run e2e` (Playwright + `@axe-core/playwright`).
2. **Live browser audit** — Lighthouse + manual snapshot/focus/contrast checks against a running dev server, cross-checking every claim in the accessibility hardening design spec.
3. **Manual HTML5/CSS3 review** — of the rendered DOM (not the static `index.html` shell, which is empty) on four routes.
4. **Static review** — i18n hardcoded-string sweep, a Nielsen-heuristics usability walkthrough, and a code-quality/tooling gap check.

**Known limitations of this pass:**
- No outbound internet access from the audit sandbox — the W3C Nu HTML Checker (`validator.w3c.org`) was unreachable, so HTML5/CSS3 conformance was checked by manual spec review of the rendered DOM instead of an actual validator run.
- Not runtime-tested: tap-target sizing (WCAG 2.5.8's 24×24px minimum), keyboard-trap testing on any modal, Character Match and Animal Sounds individually (Color Match was the game exercised live), Admin's tab-switch focus-visible states, and a live contrast-ratio measurement on the disabled-wrong-choice state.

## Automated test suite — clean

- 506/506 unit tests pass (47 files), zero `jest-axe` violations.
- 70/70 Playwright e2e tests pass, including page-level `@axe-core/playwright` scans on every screen (dashboard, admin, badges tab, all three games' intro/gameplay screens, kids-progress) — zero accessibility violations found.
- ESLint: 0 errors, 3 warnings — all three are "unused eslint-disable directive" inside *generated* coverage-report JS (`block-navigation.js`, `prettify.js`, `sorter.js`), not application code. `eslint.config.js`'s `ignores` array doesn't include `coverage`.
- Coverage: per-file numbers are healthy where it matters (`src/hooks` and `src/i18n` 100%, `src/storage` 97.95%, `ParentDashboard.jsx` 97.32%, `AdminPage.jsx` 98.5%), but the top-level "All files" rollup prints `0 | 0 | 0 | 0` because `vite.config.js`'s `test.coverage` has no `include`/`exclude` scoping to `src/**`, so it sweeps in `playwright.config.js`, `scripts/*.mjs`, and other non-`src` files at 0%.
- The new focus-management effects trigger React `act()` warnings (tests still pass) in `ParentDashboard.test.jsx`, `KidsProgressPage.test.jsx`, `ColorMatchGame.test.jsx`, and `CharacterMatchGame.test.jsx` — the effects aren't fully synchronized with Testing Library's async utilities.

## Accessibility — WCAG 2.2 AA

Lighthouse scored the Dashboard **100/100** for accessibility; zero native Chrome accessibility issues logged across six routes. Every claim in the 2026-07-05 hardening design spec was checked against the live app:

| Claim | Status |
|---|---|
| Focus-visible rings on gameplay controls | **Confirmed live** (computed style verified on `.game__choice`, `.results__btn`; not individually re-spot-checked on Animal Sounds/Character Match/Admin, which share the same class) |
| Focus moves to the view's heading on transition | **Confirmed live** — Dashboard, GameIntro, GameResults, Parent Dashboard, Admin, Kids Progress |
| `aria-live` scoped to `StreakBadge` only | **Confirmed** — appears nowhere else in the codebase |
| `prefers-reduced-motion` guard | **Confirmed by source** (`src/index.css:72–76`); not toggle-tested at runtime |
| Disabled-wrong-choice contrast fix | **Unverified** — opacity fade is gone, replaced with `filter: grayscale(85%) brightness(0.88)` as designed, but the actual contrast ratio was never measured (this state wasn't hit during the live pass) |
| Chart accessibility fallback tables | **Confirmed** — `ScoreTrendChart`/`ResponseTimeChart` render a shared `<ChartDataTable>` using the standard clip-rect `sr-only` technique (not `display:none`); legend/line names use translated game names, not raw ids. Not exercised at runtime (no score history existed in the session) |

Incidental: Lighthouse also scored the Dashboard 83/100 on SEO and 67/100 on "Agentic Browsing" — outside what was asked, noted for awareness only.

## HTML5 & CSS3 validity

Clean across all four routes reviewed (`/`, `/game/character-match`, `/admin`, `/parent`): `<html lang="en">` present everywhere, no duplicate `id` attributes, every `<img>` has `alt`, no deprecated attributes, no invalid nesting, no vendor-prefix-only CSS, sequential heading order.

Findings:
- **Incomplete ARIA Tabs pattern** — `role="tab"`, `role="tablist"`, `aria-selected` are present across 10 tab buttons, but no `role="tabpanel"` exists anywhere in the rendered DOM, and no `aria-controls` links a tab to its panel. Valid HTML; incomplete WAI-ARIA Authoring Practices Tabs pattern. (`src/components/Dashboard.jsx`, `src/admin/AdminPage.jsx`)
- **Two `!important` overrides** — specificity smell, not invalid CSS. (`src/index.css:78` `.correct`, `:80` `.highlight-correct`, both `background: #a5d6a7 !important`)
- **One hardcoded hex color** bypassing the project's own design-token convention stated in `CLAUDE.md`. Only instance found outside `index.css` itself. (`src/components/Dashboard.css:85` — `color: #fff`)

## Internationalization

All four fixes claimed by the hardening design spec were re-verified directly against current source (not taken on the spec's word) and are confirmed landed:
- `admin.noGamesFound` (`AdminPage.jsx:412`)
- Interpolated `parent.missedItemsAriaLabel` (`ParentDashboard.jsx:268`)
- Manifest display names replacing raw `gameId` in the missed-items panel, streak table, and chart legend (`ParentDashboard.jsx:167,264,267,300–301`)
- Translated dashboard/admin tag labels with a fallback for custom tags (`Dashboard.jsx:24–25`)

New gaps found (both low severity, both consistent with decisions already made in the hardening spec):
- **No plural form registered** — `common.difficultyOfferHeading` (`src/i18n/en.json:11`) interpolates `{{count}}` with no i18next `_plural` sibling. Harmless in English; will need one the moment a locale with real plural rules is added.
- **Two physical-direction CSS properties** instead of logical ones — `text-align: left`/`right` where `start`/`end` would be RTL-ready (`src/parent/ParentDashboard.css:104, :211`). Matches the hardening spec's own explicit decision to defer RTL.

## Usability

Reviewed against Nielsen's heuristics, read through the lens of the app's actual audience (infants/toddlers, per `CLAUDE.md`):
- **Recognition over recall** — games lean on icon/visual choices via the shared `GameChoiceGrid` pattern. Sound choice.
- **Visibility of system status** — multi-channel feedback (color + shake/pulse + `StreakBadge`'s live announcement), now properly respecting reduced-motion. Sound choice.
- **Error prevention** — destructive admin controls live behind a separate `/admin` route, away from the child-facing `/game/<id>` flow. Sound choice.
- **Gap (low severity):** no confirmation step found on the admin reset action (`.admin__reset`). Severity is low since this surface isn't child-facing, but a confirm step is standard practice for a destructive, irreversible action.

## Code quality & tooling

- **Real gap:** `eslint.config.js` configures only `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` — no `eslint-plugin-jsx-a11y`. Every a11y check currently happens at test time via `jest-axe`/`@axe-core/playwright`, which only catches issues in code paths a test or story actually exercises; static linting would catch missing-`alt`/invalid-role/non-focusable-interactive patterns everywhere, including untested code.
- **Minor gap:** no Stylelint, Prettier, or `.editorconfig` — CSS has no automated check for invalid properties, vendor-prefix drift, or the logical-property RTL convention noted above.
- Otherwise no drift found from `CLAUDE.md`'s own stated conventions (storage-adapter pattern, manifest-driven prop passing, design-token usage aside from the one `Dashboard.css` exception above).

## Worth knowing — analytics & child-directed compliance

The app ships a real, working Google Analytics 4 integration — off by default, opt-in via the admin panel. A `GoogleAnalytics` component (`src/App.jsx:28–53`) injects `gtag.js` and fires a `page_view` event on every route change, but only once an admin types a Measurement ID into a settings field (`src/admin/AdminPage.jsx:210–218`; placeholder `G-XXXXXXXXXX`, empty by default). As a single-family, self-hosted, GA-off-by-default tool, there is no current exposure.

Why it matters: the moment that toggle is switched on for a property explicitly aimed at children under 13, it starts sending page-view and device/IP-derived data to Google's servers from a child's session — the kind of data flow the FTC's COPPA Rule (16 CFR Part 312) requires verifiable parental consent for on a child-directed site/app operated beyond a single family. Google Play's "Designed for Families" policy and Apple's Kids Category guidelines go further and prohibit most third-party analytics/ad SDKs outright. **Not a fix needed today** — the trigger point is distribution + GA switched on, not the current state.

## Other standards worth knowing about

| Standard | Why it applies here |
|---|---|
| WCAG 2.2 SC 2.5.8 (Target Size, Minimum) | A 24×24px minimum is an AA-level 2.2 criterion, not the "larger than AA" touch targets the hardening spec deliberately excluded. Unverified this pass. |
| WAI-ARIA Authoring Practices Guide — Tabs pattern | Reference for closing the `role="tabpanel"`/`aria-controls` gap above. |
| W3C Nu HTML Checker | Never actually run this pass — no outbound internet. Worth wiring the real validator (or offline `html-validate`) into CI against rendered-DOM snapshots. |
| eslint-plugin-jsx-a11y, Stylelint, Prettier, EditorConfig | Concrete tools to close the static-analysis gap above. |
| BCP 47 / Unicode CLDR plural rules | The `_plural` gap above becomes a real bug, not a latent one, the moment a second locale ships. |
| COPPA (FTC) / Google Play Families / Apple Kids Category | Covered above — relevant only if ever distributed with analytics switched on. |
