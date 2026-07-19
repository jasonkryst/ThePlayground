# Security hardening: CSP, Permissions-Policy, CSV injection (issue #86) Implementation Plan

**Goal:** Close out audit findings SEC-2 (CSP), SEC-3 (`Permissions-Policy` +
`server_tokens off`), and SEC-5 (CSV builder hardening), and document the
SRI-for-GA-loader item as resolved by the CSP `script-src` allowlist.

**Full spec:** `docs/superpowers/specs/2026-07-18-security-hardening-design.md`.

## Global Constraints

- CSP policy string, Permissions-Policy value, and the CSV escaping
  algorithm are all fully specified in the spec — this plan is
  implementation, not design exploration.
- `style-src 'unsafe-inline'` stays — required by existing per-item inline
  styles; tightening it further is explicitly out of scope.
- Every field in the CSV (not just future free-text ones) gets quoted —
  removes any future judgment call about which columns need it.

---

### Task 1: CSV injection hardening (SEC-5) — TDD

**Files:** `src/utils/dashboardUtils.js`, `src/utils/__tests__/dashboardUtils.test.js`

- [ ] Update the two existing assertions that depend on exact empty-string
      equality (`avgResponseMs` at `cols[5]`, `peakStreak` at `cols[6]`) to
      expect `'""'` instead of `''`, since every field is now quoted.
- [ ] Add a `describe('buildCsvContent — CSV injection hardening (SEC-5)')`
      block with:
  - Positive: plain values still round-trip (substrings present, row count
    unchanged, header row quoted consistently).
  - Negative/hostile: a value starting with `=`, `+`, `-`, `@` gets a leading
    `'` inside its quotes; a value containing `=` *not* in leading position
    is untouched; an embedded `"` is doubled; an embedded `,` or `\n` stays
    inside its field's quotes (checked via exact substring, not naive
    line/column splitting, which would misparse an embedded delimiter).
- [ ] Run `npx vitest run src/utils/__tests__/dashboardUtils.test.js` —
      confirm the new hostile-input tests fail against the current
      (unescaped) implementation.
- [ ] Add `escapeCsvField` to `dashboardUtils.js` (module-private) and map
      every emitted field (headers + rows) through it in `buildCsvContent`.
- [ ] Re-run the same test file — confirm all tests pass, including the
      updated empty-string and new hostile-input cases.

### Task 2: CSP + Permissions-Policy + server_tokens (SEC-2, SEC-3) — TDD

**Files:** `nginx/security-headers.conf`, `nginx.conf`,
`nginx/__tests__/securityHeaders.test.js`, `e2e/nginx-headers.spec.js`

- [ ] Extend `nginx/__tests__/securityHeaders.test.js`:
  - Add a regex-escaping helper (the existing `REQUIRED_HEADERS` pattern
    builder breaks on `Permissions-Policy`'s `()`/`,` characters).
  - Add `Permissions-Policy` to the required-headers check (exact value:
    `camera=(), microphone=(), geolocation=(), payment=()`).
  - Add a CSP-specific test: `Content-Security-Policy` present with
    `always`, containing each key directive (`default-src 'self'`,
    `script-src ... googletagmanager.com`, `object-src 'none'`,
    `frame-ancestors 'self'`, `base-uri 'self'`) via substring checks.
  - Add a test that `nginx.conf` contains `server_tokens off;`.
  - Confirm these fail against the current config (TDD red).
- [ ] Add the two `add_header` lines to `nginx/security-headers.conf` (CSP,
      Permissions-Policy — exact values in the spec) and `server_tokens
      off;` to `nginx.conf`'s `server {}` block.
- [ ] Re-run the static test file — confirm all pass.
- [ ] Extend `e2e/nginx-headers.spec.js`:
  - Add `content-security-policy` and `permissions-policy` to the expected
    per-response header checks (reuse the existing per-asset-tier loop
    plus the document-response test).
  - Add a test asserting the `server` response header does not contain a
    version number (`server_tokens off` regression guard).
- [ ] Run `npx playwright test e2e/nginx-headers.spec.js` if Docker is
      available; otherwise confirm the suite still `test.skip()`s cleanly
      (acceptable, matches existing behavior on machines without Docker).

### Task 3: Documentation sync

**Files:** `SECURITY.md`, `docs/ENHANCEMENTS.md`, `docs/DEPLOYMENT.md`

- [ ] `SECURITY.md` — "Known gaps" section: remove the CSP and
      Permissions-Policy/server_tokens bullets (both now shipped); add a
      line documenting the shipped CSP policy and Permissions-Policy value;
      note the SRI item as resolved via the CSP `script-src` allowlist.
      "HTTP security headers" table gains rows for the two new headers.
- [ ] `docs/ENHANCEMENTS.md` § Security — strike through the CSP,
      Permissions-Policy/server_tokens, CSV-builder, and SRI bullets
      following the existing `~~...~~` — done (issue #N) convention used for
      SEC-1/SEC-4.
- [ ] `docs/DEPLOYMENT.md` — "nginx configuration, annotated" section:
      update the reproduced `nginx.conf` and `security-headers.conf` code
      blocks to the new content; extend the "Security headers" prose
      paragraph to cover CSP and Permissions-Policy; note `server_tokens
      off` alongside the `listen` directive explanation.

### Task 4: Changelog, version bump, full verification

**Files:** `CHANGELOG.md`, `package.json`

- [ ] Bump `package.json` version (minor bump — new hardening, no breaking
      change).
- [ ] Add a `CHANGELOG.md` entry (issue #86, SEC-2/SEC-3/SEC-5 + SRI note).
- [ ] Run `npm test -- --run` — all pass.
- [ ] Run `npm run lint` (remove `storybook-static/` first if present —
      known false-failure source, see project memory) — no errors.
- [ ] Run `npm run e2e` (or at minimum `nginx-headers.spec.js` +
      `dashboardUtils`-adjacent specs if the full suite is slow/unavailable)
      — pass or clean Docker skip.

## Self-Review Notes

- **Spec coverage:** CSP (Task 2), Permissions-Policy + server_tokens (Task
  2), CSV hardening (Task 1), SRI note closed via docs only (Task 3),
  changelog/version (Task 4). All spec sections covered.
- **No placeholders:** exact header values and the exact `escapeCsvField`
  implementation are in the spec; this plan references them rather than
  duplicating, to avoid the two drifting.
