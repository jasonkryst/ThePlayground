# Fix All Pipelines — Design

**Issue:** GitHub #141 ("Fix All Pipelines")
**Date:** 2026-07-28

## Summary

Every CI run on `main` has failed since PR #135 (2026-07-24). Issue #141 has no
body — "fix all pipelines" is the whole brief — so this design starts with an
audit of what's actually broken, since the failures turn out to be five
unrelated problems bundled under one vague title, not one root cause:

| # | Job | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | `npm-audit` | Fails on every run | `react-router` 7.12.0–8.2.0 (installed: 7.18.1) matches a high-severity advisory (GHSA-qwww-vcr4-c8h2, RSC-mode CSRF) published after PR #136 shipped the gate | Swap the gate to `audit-ci` with a scoped allowlist for this one advisory; track the real fix (React 19 + react-router 8) as backlog |
| 2 | `lighthouse` | Fails since PR #139 (2026-07-27) | `ubuntu-latest` no longer guarantees a pre-installed Chrome for `lhci`'s `chrome-launcher` to find — unrelated to any app code change, an environment assumption from the original CI design (`docs/superpowers/specs/2026-07-22-ci-pipeline-design.md`) that's since broken | Add an explicit `browser-actions/setup-chrome@v2` step, wire its `chrome-path` output to `CHROME_PATH` |
| 3 | `e2e` (visual) | 5 tests fail: "snapshot doesn't exist" | Two feature PRs (#92 per-game result theming, #131 Sound Memory Match) generated their Playwright baseline screenshots on a Windows dev machine (`*-chromium-win32.png`, already committed) but CI runs on Linux and needs `*-chromium-linux.png` — those were never generated | Generate the 5 missing Linux baselines in a Docker container pinned to the installed Playwright version, commit them |
| 4 | `e2e` (zoom-large-text) | 1 test fails: horizontal overflow at phone width under large text | Core Themes (PR #140) added a 4th header icon (`.shell__theme-toggle`) to a row already documented as a fixed-width budget; that icon (and the pre-existing 3) size their glyph with `font-size: 1.5rem`, which scales with the large-text root-font simulation even though their box is a hard `min-width/min-height: 48px` floor — under 2× text the glyphs outgrow the fixed box and the header overflows | Freeze the icon glyph `font-size` to a fixed `px` value so OS/app text-scaling can't inflate icon-only buttons past their already-fixed touch target |
| 5 | `e2e` (confetti-csp) | 1 test flakes: 60s timeout waiting for `game-intro-start` | `confetti-csp.spec.js`'s 3 tests share a worker-scoped `beforeAll` that runs `npm run build` into the repo's single `dist/` directory, then bind-mounts that same directory into a Docker container. With `fullyParallel: true` and 2 CI workers, two of those tests can land on different workers, so two `npm run build` invocations can run concurrently against the same `dist/` output — one build's in-progress file writes intermittently getting served (or clobbered) by the other worker's container, which is consistent with a page that never finishes mounting | `test.describe.configure({ mode: 'serial' })` (same pattern already used in `e2e/visual.spec.js`, for an analogous worker-contention reason) forces all 3 tests onto one worker, so there's only ever one `beforeAll`/one build per run |

All five are independent — no shared code path — so they're fixed as five
separate, narrowly-scoped changes rather than one sweeping refactor.

## 1. `npm-audit`: scoped allowlist via `audit-ci`

**Why not just downgrade react-router-dom to 7.11.0** (`npm audit`'s own
suggested fix, which would clear the gate with zero API changes since the app
only uses long-stable `BrowserRouter`/`Routes`/`Route`/`Link`/`Outlet`/hook
APIs)**, or upgrade to react-router 8.3.0** (the version where the advisory's
fixed range begins)**?** Decided with the user (2026-07-28): react-router 8
removes the `react-router-dom` package entirely (imports move to
`react-router`) and requires React ≥19.2.7 — this app is on React 18.3.1, so
the real fix is a React 18→19 upgrade across the whole app, not a
router-only change. That's real, valuable work, but it's a different, much
larger piece of work than "the pipelines are red" — it goes on the backlog
(`docs/ENHANCEMENTS.md`) rather than getting rushed through here. Downgrading
to 7.11.0 was considered and rejected too: it trades one dependency problem
for another (permanently pins below the vulnerable range using an exact
version, since `^7.11.0` would immediately re-resolve into 7.12+ on the next
install).

**Is the advisory even reachable here?** GHSA-qwww-vcr4-c8h2 is "RSC Mode CSRF
Bypass Allows Action Execution Before 400 Response" — this app is a Vite SPA
using classic client-side `<BrowserRouter>`, never React Server Components or
react-router's framework/data mode, so the vulnerable code path is not
exercised by anything this app does. That's the basis for allowlisting it
rather than treating it as a live production risk today — but it's still a
real advisory against a real dependency in the tree, so it stays visible
(not silently ignored) and gets tracked to an actual fix.

**Mechanism:** plain `npm audit` has no per-advisory allowlist (no
`.nsprc`-equivalent survives in modern npm) — the only lever is
`--audit-level`, which is a severity floor, not a per-finding exception, so
raising it would blind the gate to *any* future moderate finding, not just
this one. `audit-ci` (new devDependency, `^7.1.0`) adds exactly the missing
primitive:

```yaml
- name: Production dependency audit (gate)
  run: npx audit-ci --moderate --skip-dev --allowlist GHSA-qwww-vcr4-c8h2
```

- `--moderate`: same severity floor as before (`--audit-level=moderate`).
- `--skip-dev`: same scope as before (`--omit=dev` — production tree only).
- `--allowlist GHSA-qwww-vcr4-c8h2`: the *only* exception. Any other
  moderate+ finding, in react-router or anywhere else in the prod tree,
  still fails the job exactly as before. Confirmed locally
  (`npx audit-ci@7.1.0 --moderate --skip-dev --allowlist GHSA-qwww-vcr4-c8h2`
  against this repo's current lockfile): exits 0, printing "Found
  vulnerable allowlisted advisories: GHSA-qwww-vcr4-c8h2" — the finding is
  still surfaced in the log, just not fatal.
- The dev-tree report-only step is untouched (still plain
  `npm audit --omit=prod`, still never fails the job) — `audit-ci` isn't
  needed there since nothing in that step can fail the build anyway.

**Backlog entry** (`docs/ENHANCEMENTS.md`, Security section): upgrade to
React 19 + react-router 8, which removes the need for this allowlist
entirely — referenced from the allowlist's own inline comment so a future
reader finds the actual fix, not just the workaround.

## 2. `lighthouse`: explicit Chrome install

The original CI design (§3 of `2026-07-22-ci-pipeline-design.md`) never
installed a browser for the `lighthouse` job — it implicitly relied on
`ubuntu-latest` shipping a system Chrome that `@lhci/cli`'s `chrome-launcher`
dependency could auto-detect. That worked when the job was authored and
through the next several PRs (last confirmed passing: PR #138's merge,
2026-07-26), then broke starting with PR #139's merge (2026-07-27) —
`❌ Chrome installation not found` / `ERROR: The "path" argument must be of
type string. Received undefined`. Nothing in PR #139's diff (issue #127,
parental lock) touches anything Chrome- or Lighthouse-related, so this reads
as a GitHub-runner-image change (Chrome no longer bundled, or bundled
differently) landing between those two dates, not an app regression — but
either way, an implicit dependency on "whatever happens to be on the runner
image today" is exactly the kind of thing that's supposed to be pinned
explicitly rather than re-diagnosed the next time it silently breaks.

**Fix:** add an explicit, versioned Chrome install step, and wire its path
into the env var `chrome-launcher` (and therefore `lhci`) checks first:

```yaml
- name: Set up Chrome for Lighthouse CI
  id: setup-chrome
  uses: browser-actions/setup-chrome@v2
  with:
    chrome-version: stable
- name: Run Lighthouse CI
  run: npx lhci autorun
  env:
    CHROME_PATH: ${{ steps.setup-chrome.outputs.chrome-path }}
```

`browser-actions/setup-chrome` is a widely-used, actively maintained action
built for exactly this; pinned to the `v2` major tag, matching this repo's
existing convention for non-security-critical tooling actions
(`actions/checkout@v4`, `actions/setup-node@v4`) as opposed to the exact-patch
pin used for the security-sensitive `aquasecurity/trivy-action@v0.36.0`.

## 3. `e2e` visual regression: missing Linux baselines

Playwright's `toHaveScreenshot()` names baseline files with the OS platform
baked in (`<id>-chromium-<platform>.png`) specifically because font
rendering/anti-aliasing differs enough between platforms that a
cross-platform baseline isn't reliably byte-comparable. PRs #92 and #131 each
added new stories and ran `--update-snapshots` on a Windows dev machine,
producing and committing `*-chromium-win32.png` files — correct for local
iteration on Windows, but CI (`ubuntu-latest`) needs the `*-chromium-linux.png`
sibling, which nobody generated. Five stories are affected:

- `components-gameresults--with-accent` (+ `-dark`, `-high-contrast`)
- `components-gameresults--memory-perfect-run`
- `games-soundmemorymatchgame--default`

**Fix:** generate the missing Linux baselines pixel-matched to CI by running
the same Playwright version CI uses (`@playwright/test@1.61.1`, per
`package.json`) inside `mcr.microsoft.com/playwright:v1.61.1-noble` — the
official image already carries a Linux Chromium build matched to that exact
Playwright release, the same guarantee `npx playwright install` gives the
real `e2e` CI job. Only the 5 missing stories are targeted (not a blanket
`--update-snapshots` over the whole suite, which would risk silently
overwriting an unrelated baseline that's failing for a real reason); the
existing 44 Linux baselines are left untouched. Both the win32 and linux
files stay committed side by side — that's the intended, already-established
pattern (every other themed story already has both), not new scope.

## 4. `e2e` zoom-large-text: header icon overflow

`src/components/AppShell.css`'s row-1 header already documents its own width
budget deliberately (`.shell__side { flex: 0 0 auto }` — "Fixed to its
content (never grows or shrinks)"), with an explicit comment computing the
worst case in pixels for a 3-icon nav row against real phone widths. Core
Themes (PR #140) added a 4th icon, `.shell__theme-toggle`, without touching
that budget or re-verifying it under the large-text e2e guard
(`e2e/zoom-large-text.spec.js`, itself written for issue #130's earlier,
different overflow bug). Diagnosed directly (walked `getBoundingClientRect()`
over every element at the test's exact viewport/font-scale): the overflowing
elements are `.shell__side--end` / `.shell__nav` / `.shell__nav-link` — the
icon row itself, not the chart data table the test was originally guarding.

The actual mechanism: `.shell__back`, `.shell__nav-link`, `.shell__home`, and
`.shell__theme-toggle` all pair a hard pixel floor (`min-width: 48px;
min-height: 48px`) with a *relative* glyph size (`font-size: 1.5rem`). Under
normal text scale that's consistent (1.5rem ≈ 24px sits comfortably inside a
48px box). Under the large-text simulation (`html { font-size: 32px }`,
double the 16px baseline), `1.5rem` becomes 48px — the glyph itself now
matches the box's minimum dimension, pushing each button wider than its
floor to fit it, and with a 4th button added, four buttons individually
overflowing their nominal width is enough to blow the phone-width budget documented in the CSS comment.

**Fix:** the row's own stated design intent is "fixed to its content, never
grows or shrinks" — that's already inconsistent with a glyph size that
*does* grow with root font-size. Freezing `.shell__back`,
`.shell__nav-link`, `.shell__home`, and `.shell__theme-toggle`'s icon
`font-size` to a fixed `24px` (instead of `1.5rem`) makes the implementation
match the already-documented intent: these are icon-only, aria-labelled
controls (glyphs, not textual content WCAG 1.4.4 resize-text applies to),
already sized to a generous fixed 48px touch target regardless of text
settings — freezing the icon glyph size doesn't reduce legibility of any
actual text content, it just stops icon buttons from outgrowing a box that
was never going to grow itself. The row-1 width-budget comment gets updated
to account for 4 icons instead of 3.

## 5. `e2e` confetti-csp: worker-parallel build race

`e2e/confetti-csp.spec.js` has 3 tests sharing one `describe` block's
worker-scoped `beforeAll`, which runs `npm run build` (writing to the repo's
single `dist/` directory) and then starts an nginx Docker container bind-
mounting that same `dist/`. Without `fullyParallel`'s default serialization
guard, Playwright is free to schedule any of those 3 tests onto either of
CI's 2 workers — and when two land on different workers, each worker runs
its *own* copy of `beforeAll`, so two `npm run build` processes can run
concurrently, both writing into the one shared `dist/` directory. This is
exactly the kind of shared-mutable-directory race Playwright's own
`e2e/visual.spec.js` already documents and works around (`test.describe.
configure({ mode: 'serial' })`, there for cold-compile contention against
Storybook rather than a concurrent build, but the same fix applies for the
same underlying reason: force every test in the file onto one worker so
there's only ever one `beforeAll` per run).

**Fix:** add the same `test.describe.configure({ mode: 'serial' })` to
`confetti-csp.spec.js`'s outer `describe` block. This is the most direct
explanation available for the observed symptom (a hard 60-second timeout
waiting for a button that should render almost immediately, on a page/route
untouched by the PR that first exposed the flake) — the alternative
read, "this is unrelated infrastructure flakiness," doesn't explain why nginx
would ever take 60+ seconds to serve a static `index.html` it's already
bind-mounted, whereas a build clobbering the very directory being served
does. Serializing removes the race regardless; if the timeout recurs after
this change with `dist/` no longer contested, that would be the signal this
read was wrong and something else needs to be investigated — not expected,
but the fallback plan if it happens.

## Testing plan

Each fix gets both the positive and negative coverage its mechanism
supports:

- **`audit-ci` allowlist** (`.github/__tests__/ci.test.js`): positive —
  gate step's `run` contains `audit-ci`, `--moderate`, `--skip-dev`, and
  `--allowlist GHSA-qwww-vcr4-c8h2`, with no `continue-on-error` and no
  `|| true` (same unsilenced-gate guarantee as before). Negative — the gate
  step's `run` string contains exactly one `GHSA-` token (guards against a
  future PR silently widening the allowlist to cover an unrelated finding
  without this design doc's scrutiny); the dev-tree report step is
  unchanged (still `--omit=prod`, still `always()`, still masks its own
  exit).
- **Lighthouse Chrome setup** (`.github/__tests__/ci.test.js`): positive —
  a `browser-actions/setup-chrome` step exists in the `lighthouse` job,
  ordered before the `lhci autorun` step, and the `lhci autorun` step's
  `env.CHROME_PATH` references that step's `chrome-path` output. Negative —
  the setup-chrome step is not present in any *other* job (it's only needed
  where `lhci` actually launches a browser).
- **Visual baselines**: no new test code — `e2e/visual.spec.js` already
  covers these 5 stories; the fix is the missing baseline assets themselves.
  Real validation is the `e2e` job going green in Actions.
- **Header icon overflow**: the existing `e2e/zoom-large-text.spec.js`
  positive test (no-overflow at phone width + large text) and its sibling
  negative test (data table still exposes every column to screen readers)
  already form the pos/neg pair for this regression — fixing the CSS is
  what's being verified, not new test code. Confirmed locally pre/post fix
  with a direct Playwright repro script.
- **confetti-csp serial mode**: no new assertions — the fix is a scheduling
  change verified by the existing 3 tests (1 positive per-pair-match, 1
  positive full-board, 1 negative animations-disabled) passing reliably
  instead of intermittently. Real validation is several repeated CI runs
  without the flake recurring (a single green run doesn't fully rule out a
  race — the fix's *rationale* is the actual argument this is safe, not one
  green run).

## Documentation updates

- **`docs/TESTING.md`** — Continuous Integration section: describe the
  `audit-ci` allowlist mechanism (replacing the plain `npm audit` gate
  description) and the explicit Chrome install step for `lighthouse`.
- **`docs/ENHANCEMENTS.md`** — Security section: new backlog bullet for the
  React 19 + react-router 8 upgrade that would let the GHSA-qwww-vcr4-c8h2
  allowlist entry be removed.
- **`SECURITY.md`** — update the `npm audit` in CI line to describe the
  `audit-ci` swap, the scoped allowlist, and why (RSC-mode advisory not
  reachable by this SPA's routing usage), with a forward pointer to the new
  backlog item.
- **`CHANGELOG.md`** + **`package.json`** — patch/minor version bump per the
  repo's release convention (infrastructure + a real CSS bugfix, no new
  feature surface).

## Risks / open questions

- **The confetti-csp fix is inferred, not directly reproduced.** The
  concurrent-build race is the most coherent explanation for the symptom
  given the code's actual structure, but it only manifested once in CI so
  far and hasn't been forced to reproduce locally (would need real worker
  contention against a shared `dist/`, which is awkward to simulate
  deterministically outside CI's exact scheduling). Serializing the describe
  block is safe regardless of whether this specific theory is 100% correct —
  it removes the only known concurrent-build hazard in the file either way.
- **Lighthouse fix is unverifiable outside real GitHub Actions.** `act`
  remains out of scope (per the original CI design's own reasoning), so this
  change is validated the same way the original design doc says everything
  workflow-shaped ultimately is: "the Actions run itself is the live proof."
  That proof surfaced a second, deeper issue the local investigation
  couldn't have caught: once Chrome was actually found (confirming §2's fix),
  launching it crashed with `No usable sandbox!` — Chrome installed by
  `browser-actions/setup-chrome` has no setuid-sandbox helper or AppArmor
  profile registered in the Actions container's namespace, unlike whatever
  a distro-packaged/apt-installed Chrome would have. First attempt,
  `collect.settings.chromeFlags: ["--no-sandbox"]`, turned out to be
  silently ignored — lhci's own runtime warning explained why: this config
  already sets `collect.puppeteerScript` (for the parental-lock
  `localStorage` seed), and `chromeFlags` is only honored on the
  non-puppeteerScript launch path. The actual fix is
  `collect.puppeteerLaunchOptions.args: ["--no-sandbox"]`, which passes
  straight through to `puppeteer.launch()` regardless of `puppeteerScript`
  — confirmed against a real Actions run. A negative test now guards the
  first (wrong) key path specifically, since it's exactly the kind of
  looks-right-but-silently-does-nothing config that would otherwise
  regress unnoticed.
- **The PR's own first real CI run also surfaced one unrelated `e2e` flake**
  (`css-validity.spec.js`'s "animal sounds gameplay screen has no invalid
  inline CSS" — a 60s timeout waiting for `game-intro-start` to become
  clickable against the shared `npm run dev` webServer). Same *symptom*
  shape as §5's confetti-csp race (a button that should render almost
  immediately taking too long under worker contention), but a different
  mechanism — this test doesn't share confetti-csp's `beforeAll`/build/
  Docker machinery at all, it's a plain `page.goto` + click against the
  suite's one shared dev server, which many parallel CI workers request
  different game routes from simultaneously. No prior occurrence found
  across the last 15+ CI runs searched, and this PR's own changes don't
  touch `animal-sounds` or `css-validity.spec.js` — treated as a one-off
  flake (re-run to confirm) rather than a sixth pipeline bug in scope of
  issue #141, since inventing a fix for an unreproduced, never-before-seen
  single failure risks solving the wrong problem. Worth revisiting if it
  recurs.
