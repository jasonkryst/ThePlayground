# Full Audit — Findings (Issue #133)

Date: 2026-07-28
Status: Findings (this pass documents and, for markdown files only, corrects drift — application-code findings below are **not fixed here**; each category becomes its own follow-up GitHub issue per the parent issue's instructions)
Branch audited: `133` (created off `main` @ `e7a3828`, which includes issue #141's CI-pipeline fixes)
App version at audit time: `0.40.1`

## Context

GitHub issue #133 asked for a full re-run of the standing audit suite (security, testing, accessibility, i18n, general coverage), a review/update of every markdown file, and one follow-up GitHub issue per finding category. This repo has run this kind of audit several times before — `docs/superpowers/specs/2026-07-05-standards-audit-findings.md`, `2026-07-12-security-audit-findings.md`, `2026-07-12-doc-review-design.md`, and the wave-1/wave-2 accessibility/i18n specs are the precedent. This pass is a **delta audit**: six independent investigations, each briefed on the relevant prior-audit docs, tasked with reporting what's still open, what's new, and what's now confirmed fixed — not re-litigating settled ground.

## Methodology

Six parallel investigations, each running real commands against the live repo (not just reading docs):

1. **Security** — `npm audit`, XSS-surface grep, CSP/header review, container posture, CI/CD permissions review, COPPA/GA posture.
2. **Accessibility (WCAG 2.2 AA)** — full automated suite (`lint`, `test`, `e2e` incl. axe-core scans), source re-verification of every prior claim, hardcoded-color grep, ARIA-pattern review.
3. **Testing & CI** — full automated suite run with actual pass/fail counts, coverage-rollup check, CI run-history review via `gh run list`, per-game/per-hook test-coverage gap check.
4. **Enhancements backlog** — `docs/ENHANCEMENTS.md` cross-checked against shipped code and the open GitHub issue tracker.
5. **Documentation staleness** — every project markdown file cross-checked fact-by-fact against current source.
6. **i18n** — locale/game key-parity diff, hardcoded-string grep, plural-form coverage, dispatched separately once the other five returned, since the issue body names i18n explicitly and none of the first five made it primary focus.

## Summary

No Critical or Application-High severity findings. One **High** finding in the Testing/CI category (a live CI reliability gap, not a security or correctness bug). One **Medium** (a HIGH-severity supply-chain CVE that's allowlisted with sound reasoning but has no re-review mechanism). Everything else is Low/Info — either small, concrete gaps or confirmations that prior fixes are holding. The i18n and coverage/lint infrastructure came back essentially clean.

| Category | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| Security | 0 | 0 | 1 | 2 | 4 |
| Accessibility | 0 | 0 | 0 | 2 | 4+ |
| Testing & CI | 0 | 1 | 1 | 1 | 2 |
| i18n | 0 | 0 | 0 | 0 | all clean |
| Enhancements backlog | — | — | — | 1 stale entry | 6 proposed additions |
| Documentation | — | — | — | 8 files w/ drift | — |

---

## 1. Security

**Verified still solid (no regressions from issue #141's CI work):** nginx header inheritance (SEC-1), CSP (SEC-2), Permissions-Policy/server_tokens (SEC-3), CSV-injection escaping (SEC-5), container non-root/pinning (SEC-4), Trivy scanning actually wired into CI (not just planned), GA/COPPA posture unchanged (off by default), no unsafe DOM sinks anywhere in `src/`, `--no-sandbox` additions from #141 correctly CI-scoped and never reach production config.

**[Medium] React-router HIGH-severity CVE is allowlisted, not resolved.** `npm audit --omit=dev` shows 2 high-severity findings (`GHSA-qwww-vcr4-c8h2`, react-router RSC-mode CSRF bypass), passed only via a single-entry `audit-ci` allowlist with no expiry/re-review trigger. The "not reachable via `BrowserRouter`" mitigation reasoning is sound, but "allowlisted" risks being read as "resolved." Recommend a re-audit trigger (allowlist-age warning in CI, or a tracked React 19 upgrade date) — `docs/ENHANCEMENTS.md` already lists the React 19 upgrade as a backlog item referencing this CVE.

**[Low] 8 of 9 CI jobs lack explicit least-privilege `permissions:` blocks** — only the `trivy` job declares `permissions:`; the other 8 inherit the repo's default `GITHUB_TOKEN` scope rather than an explicit `contents: read` baseline. Not exploitable today, but a config-drift risk if the repo's default permission setting or ownership ever changes.

**[Low] GitHub Actions third-party dependencies pinned to floating tags, not commit SHAs** (`actions/checkout@v4`, `docker/build-push-action@v6`, `aquasecurity/trivy-action@v0.36.0`, etc.) — standard supply-chain hardening recommends SHA-pinning; a tag can be repointed without the repo's consent.

**[Info]** React 18→19 upgrade still just a backlog item; Storybook dev-dependency chain 2 majors behind (dev-only, doesn't ship); no HSTS in the container (deliberately deferred to the reverse proxy, documented); the release image built by `docker-image.yml` is never directly Trivy-scanned (only a same-commit proxy build in `ci.yml` is — low risk since they're identical at the same SHA, but worth a follow-up); Sound Memory Match (the one new game since the last security pass) introduces no new attack surface.

## 2. Accessibility (WCAG 2.2 AA)

**Automated suite: clean.** `npm run lint` 0 errors/2 unrelated warnings, `npm test` 1303/1303 passing with 0 jest-axe violations, `npm run e2e` 230/230 passing with 0 axe-core violations across light/dark/high-contrast themes.

**Verified fixed since 2026-07-05:** `eslint-plugin-jsx-a11y` wired in, Stylelint wired in, `AdminPage.jsx`'s ARIA tabs pattern fully closed (`role="tabpanel"`/`aria-controls` now present), `Dashboard.jsx`'s tag filter redesigned as a `role="group"`/`aria-pressed` button group (sidesteps the incomplete-tabs problem rather than patching it), the two `!important` overrides are now deliberate and documented (not oversights), disabled-wrong-choice and theme-token contrast are now automatedly verified by dedicated unit tests (not just unverified claims), WCAG 2.5.8 tap-target sizing verified live via `e2e/tap-target-standard.spec.js`, plural form for `difficultyOfferHeading` shipped, physical-direction CSS properties removed, admin reset now has a two-tap confirm step, focus-visible states broadly and consistently applied, the app's one modal (`ExitConfirmDialog`) has a correct focus trap.

**[Low] New instance of the incomplete-ARIA-tabs-pattern class, in a file neither prior audit named.** `src/parent/DateRangeFilter.jsx:46-59` uses `role="tablist"`/`role="tab"`/`aria-selected` with no `aria-controls` and no `role="tabpanel"` on the content below it — the same defect class fixed in `AdminPage.jsx`, present here as a genuinely new (not regressed) gap. WCAG 4.1.2 / WAI-ARIA APG Tabs pattern.

**[Low] Hardcoded hex literals outside `index.css`, beyond the single instance the 2026-07-05 audit found and which is now fixed.** `src/components/GameChoiceGrid.css:45` (`background: #a5d6a7`, duplicating `index.css:220`'s `.correct` color with no shared token) and two `var()`-fallback literals (`color: var(--color-text-muted, #666)`) duplicated identically in `AnimalMemoryMatchGame.css:11` and `SoundMemoryMatchGame.css:11`. (`MemoryBoard.css:93`'s hex is a deliberate, already-documented exception — not a finding.)

**[Info]** Issue #93 (RTL support) confirmed still open, not re-reported as new. Sound Memory Match (the newest game) already has its own axe scan and reuses hardened shared primitives — no gap found.

## 3. Testing & CI

**Automated suite (local run): clean.** Lint 0 errors/2 unrelated warnings, Stylelint 0 issues, unit 1303/1303 passing, e2e 230/230 passing locally in 4.6 minutes, coverage rollup fixed (89.21% all-files, not the prior `0|0|0|0` bug).

**[High] CI on `main` is not actually stable immediately after issue #141's fixes.** The PR-time run for #141 passed all 9 jobs; the very next push (merging PR #144 to `main`) **failed** a *different* e2e flake: `e2e/admin.spec.js:94` ("replay intro brings back a dismissed game intro") timed out waiting for `resume-prompt-start-fresh`, a distinct failure mode from any of the 6 bugs #141's own design doc diagnosed. Locally this test passes reliably; the failure appears specific to CI's 2-worker resource contention — same class of problem #141 fixed, different mechanism, undiscovered by that PR's own audit. Recommend treating this as its own follow-up rather than assuming CI health is fully closed by #141.

**[Medium] CI run history shows this is a recurring pattern, not a one-off.** Across the ~15 pushes-to-`main` runs in the week before #141, the large majority (~8 of 10) show `conclusion: failure` — context for why #141 existed, and a reminder that a single green run isn't strong evidence of stability in this pipeline.

**[Low] React `act()` warnings persist as a class of issue, though the specific affected files have shifted.** Previously flagged in `ParentDashboard.test.jsx`/`ColorMatchGame.test.jsx` (now clean); now present in `KidsProgressPage.test.jsx`, `FruitVeggieIdGame.test.jsx`, `CharacterMatchGameBluey.test.jsx`, `CharacterMatchGame.test.jsx`, and `useGameSession.test.js`. Tests still pass; the underlying pattern (focus-management effects not synchronized with RTL's async utilities) is unaddressed.

**[Info]** No test-coverage gap found across any of the 7 games or 19 hooks — every game has a `__tests__` folder, every hook has direct or thorough indirect coverage. Prettier still absent (unchanged, low priority). `npm-audit`/`lighthouse` CI jobs confirmed genuinely fixed by #141 (verified against actual run history, not just commit messages).

## 4. i18n

**Clean audit — no High/Medium/Low findings.** Full key parity confirmed across all 3 locales (`en`/`es`/`pl`) and all 7 games (every game ships all 3 locale files — the specific High-severity case this audit watched for, a shipped game missing a translation file, did not occur). Zero hardcoded user-facing strings found anywhere in `src/**/*.jsx`. All 4 pluralized keys have correct 2-form (en/es) and 4-form (pl) coverage; no new `{{count}}`-interpolated string lacks a plural sibling. `<html lang>` sync still correct and test-covered. The 2026-07-19 es/pl rollout and every feature shipped since (parental lock, session resume, tag filter bar, replay button, sound-memory-match) maintained full structural i18n coverage.

## 5. Enhancements backlog

**[Low] One stale entry, now removed from `docs/ENHANCEMENTS.md`:** "Fruit & Veggie ID" was still listed under New Games despite shipping in v0.27.0 (issue #68, closed). Everything else checked against source came back accurate — this repo keeps the doc unusually current (issues get closed and their bullet struck/removed in the same commit).

**New entries added to `docs/ENHANCEMENTS.md`** (real gaps between the open GitHub issue tracker and the doc — 4 open issues existed with no corresponding backlog entry): "Collapse the duplicate header" (issue #49), "Game enable/disable toggle in Admin" (issue #19), "Learning Spanish"/"Learning Polish" (issues #106/#108), and a new **Core Engine** section (reinstating the category the 2026-07-12 doc-review spec originally called for) with the one concrete duplication found: an identical `CHOICE_COLORS` constant in `animal-sounds` and `fruit-veggie-id`.

**[Info]** Recommend a lightweight periodic check comparing `gh issue list --state open` titles against `ENHANCEMENTS.md` headings — the doc/code drift was near-zero, but doc/issue-tracker drift is the real risk this audit found.

## 6. Documentation staleness

Reviewed: README.md, CLAUDE.md, SECURITY.md, CHANGELOG.md, docs/TESTING.md, docs/DEPLOYMENT.md, docs/ENHANCEMENTS.md, docs/accessibility_usability.md (historical record, `docs/superpowers/` treated as never-edited-retroactively per existing convention).

**All fixes below have been applied directly to the markdown files on this branch** (see git diff), per issue #133's explicit ask to review and update docs, not just report on them:

- **Storage adapter method count stale in 4 files** (README, TESTING, DEPLOYMENT, ENHANCEMENTS) — "ten methods in five pairs" corrected to 15 methods across 7 groups (`getItemStats`/`saveItemStats` added v0.35.0, `getSessionResume`/`saveSessionResume`/`clearSessionResume` added v0.36.0 were both missing from every count). CLAUDE.md's storage section updated the same way, with an added note that the contract test suite doesn't yet cover the two newer method groups (itself now a tracked gap, not silently implied as covered).
- **README.md game/architecture drift** — architecture tree only listed 4 of 7 games (missing `character-match-bluey`, `fruit-veggie-id`, `sound-memory-match`); Features list never mentioned Character Match Bluey at all (missing since it shipped); utils/hooks/components tree entries were missing 3/3/6 real files respectively; CI paragraph didn't mention the Trivy scan job; Scripts table was missing `npm run mutation`. All corrected.
- **SECURITY.md "Supported versions" table said `0.24.x`** against an actual `0.40.1` — corrected to `0.40.x`.
- **docs/TESTING.md e2e spec table missing 2 of 22 real spec files** (`session-resume.spec.js`, `zoom-large-text.spec.js`) — added, with descriptions verified against each spec's actual test names (not guessed from filenames).
- **CLAUDE.md Commands list missing 2 real scripts** (`build-storybook`, `mutation`) — added.

No action needed: CHANGELOG.md (top entry matches `package.json` exactly), docs/accessibility_usability.md (historical record, internally consistent, its findings correctly reflected downstream).

---

## Follow-up GitHub issues

Per issue #133's instruction, one issue per category will be filed with the findings above that remain open (documentation fixes are already applied on this branch and don't need a follow-up issue):

1. **Security** — react-router CVE re-review mechanism, CI job `permissions:` blocks, Action SHA-pinning, release-image Trivy scan gap.
2. **Accessibility** — `DateRangeFilter` ARIA tabs pattern, remaining hardcoded hex colors.
3. **Testing & CI** — the new `admin.spec.js` CI-only flake, persistent `act()` warnings.
4. **Enhancements** — tracking issue linking the newly-added backlog entries (already in `docs/ENHANCEMENTS.md`; issue is for visibility/triage, not new information).
5. **i18n** — no open findings; a placeholder issue is not warranted (noted here instead of filed, since the category came back clean).
