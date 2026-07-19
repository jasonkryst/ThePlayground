# Security hardening: CSP, Permissions-Policy, CSV injection (issue #86)

**Source:** GitHub issue #86, closing out audit findings SEC-2, SEC-3, and
SEC-5 (`docs/superpowers/specs/2026-07-12-security-audit-findings.md`), plus
the SRI-for-GA-loader item — all four tracked in `docs/ENHANCEMENTS.md` §
Security. SEC-1 and SEC-4 are already done (issues #84, #85); SEC-6 is
informational, no action. This closes every remaining item from the
2026-07-12 audit except HSTS (deliberately out of scope — belongs at a
reverse proxy, per `SECURITY.md`) and the npm-audit-in-CI / Trivy items
(gated on a CI pipeline that doesn't exist yet).

## Problem

Three independent Low-severity gaps, all already fully specified by the
audit (no new research needed — this is implementation, not investigation):

1. **No Content-Security-Policy (SEC-2).** The strongest structural XSS
   backstop the app doesn't ship. Complications: the opt-in GA script/connect
   hosts, and the app's legitimate per-item inline `style` attributes
   (confirmed still in use: `grep -rl 'style={{' src` hits 11 files today).
2. **No `Permissions-Policy`; `server_tokens` discloses nginx version
   (SEC-3).** Free hardening — the app uses no camera/mic/geolocation/payment
   APIs, and there's no reason to advertise the nginx version.
3. **`buildCsvContent` has no RFC 4180 quoting or formula-prefix escaping
   (SEC-5).** Not exploitable today (every field is app-generated — dates,
   `gameId`, numerics), but the next free-text column (child name, user
   content) turns this into spreadsheet formula injection the day it ships.

A fourth item, **SRI for the GA loader**, has no action per the audit: the
gtag URL serves Google-rotated content, so a script-hash/SRI pin would break
on their rotation. The audit's own conclusion — a CSP `script-src` allowlist
is the practical control instead — is satisfied by item 1 shipping. This
closes the item via documentation only, once the CSP ships.

## Approach

### SEC-2: Content-Security-Policy

Add one `add_header Content-Security-Policy` line to
`nginx/security-headers.conf`, alongside the existing three headers, so it
automatically lands everywhere they do (the `include` mechanism from SEC-1
already solves the "don't forget a location block" problem for free — no new
inheritance risk to guard).

Policy — the audit's starter policy, adopted as-is (already vetted against
this app's actual sinks: GA loader, per-item inline styles, mp3 playback, no
other dynamic content):

```
default-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'
```

Directive-by-directive rationale:

- **`script-src 'self' https://www.googletagmanager.com`** — first-party
  bundle plus the one external script the app can ever load
  (`src/App.jsx`'s GA loader, gated behind `sanitizeGaId`). No `'unsafe-inline'`
  — the codebase has zero inline `<script>` tags (grep-verified in the
  2026-07-12 audit and unchanged since).
- **`connect-src`** — `'self'` for same-origin requests (none exist today,
  but this is the fetch/XHR/beacon gate) plus the two GA hostnames gtag.js
  uses for config and hit collection.
- **`style-src 'self' 'unsafe-inline'`** — the `'unsafe-inline'` is required
  by the app's per-item inline `style` attributes (dynamic swatch colors,
  computed positions — 11 files). Tightening this to nonces/hashes or
  refactoring to CSS custom properties is a second iteration, explicitly
  deferred by the audit; not part of this issue.
- **`img-src 'self' data:'`** — first-party images plus `data:` URIs (the
  favicon and some manifest icons use inline SVG/data URIs).
- **`media-src 'self'`** — first-party mp3s (`useSoundPlayer`).
- **`object-src 'none'`** — no Flash/plugin content anywhere; belt-and-braces
  against plugin-based XSS vectors.
- **`base-uri 'self'`** — prevents a future injected `<base>` tag from
  rewriting relative URLs app-wide.
- **`frame-ancestors 'self'`** — the CSP-native equivalent of
  `X-Frame-Options: SAMEORIGIN`, which stays too (older browser fallback;
  no conflict shipping both — CSP wins where supported).

No `default-src` fallback gaps: everything the app actually loads (scripts,
styles, images, media, fetches) has an explicit directive; `default-src
'self'` only catches directives with no explicit entry (e.g. `font-src`,
which the app doesn't need beyond same-origin).

### SEC-3: Permissions-Policy + server_tokens off

- **`Permissions-Policy`** header, added to `nginx/security-headers.conf`
  next to the others (same automatic-coverage reasoning as CSP above):
  `camera=(), microphone=(), geolocation=(), payment=()` — deny outright;
  the app uses none of these APIs and this is free hardening against any
  future third-party script (i.e., if GA's payload ever changed).
- **`server_tokens off;`** goes directly in `nginx.conf`'s `server {}`
  block, *not* in `security-headers.conf`. It is not an `add_header`
  directive — SEC-1's inheritance-cancellation rule (a `location` block's
  own `add_header` cancelling inherited `add_header`s) doesn't apply to it,
  and nginx's `server_tokens` is itself inherited normally to every location
  under that server. One line, one place, no include needed.

### SEC-5: CSV injection hardening

Replace `buildCsvContent`'s naive `.join(',')` with a per-field escape that
does two things, applied to **every** field (header row included, for a
single consistent code path — headers are static strings today, so this is
free consistency, not a functional requirement):

```js
function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value)
  const defused = /^[=+\-@]/.test(str) ? `'${str}` : str
  return `"${defused.replace(/"/g, '""')}"`
}
```

1. **Formula-prefix defusal:** a field whose *raw* value starts with `=`,
   `+`, `-`, or `@` gets a leading `'` prepended before quoting. This is the
   standard mitigation (OWASP CSV Injection cheat sheet): Excel/Sheets treat
   a cell beginning with `'` as forced-text and never evaluate it as a
   formula, and hide the leading apostrophe on display.
2. **RFC 4180 quoting:** every field is wrapped in `"`, with any embedded
   `"` doubled (`"` → `""`). This is what makes fields containing commas or
   newlines safe to embed without corrupting the row structure — a second,
   independent hardening from the formula-prefix defusal, both requested by
   the audit ("quote every field... prefix-escape").

Order matters: defuse first (based on the *raw* string), then quote-escape
(so a doubled `"` from the defusal step, if any, still gets escaped
correctly) — the implementation above does exactly this by chaining the
`.replace` after the `defused` ternary.

**Why quote *every* field instead of only free-text ones:** the function
has no way to know today which future column will carry user-entered text;
uniform quoting removes that judgment call entirely and costs nothing (a
quoted integer parses identically to an unquoted one in every spreadsheet
tool and in this app's own `csv.split('\n')`-based tests, updated below).

## Files changed

- **`nginx/security-headers.conf`** — two new `add_header` lines (CSP,
  Permissions-Policy), both with `always` for consistency with the existing
  three.
- **`nginx.conf`** — one new line, `server_tokens off;`, in the `server {}`
  block (placed right after `listen 8080;`, before the `include`).
- **`src/utils/dashboardUtils.js`** — `escapeCsvField` helper (module-private,
  not exported — matches this file's existing pattern of private helpers
  like the `byDate` accumulators, tested only through the public functions
  that use them) and `buildCsvContent` updated to map every field through it.
- **`nginx/__tests__/securityHeaders.test.js`** — new assertions for CSP
  (key directives present via substring checks — the full policy string is
  long, and directive-level checks are more resilient to reordering) and
  Permissions-Policy (exact value, same pattern as the other three headers,
  with a regex-escaping helper added since `()` and `,` are regex
  metacharacters the existing three header values didn't contain); new
  assertion that `nginx.conf` contains `server_tokens off;`.
- **`e2e/nginx-headers.spec.js`** — live-container assertions that the CSP
  and Permissions-Policy headers are actually served, and that the `Server`
  response header carries no version (`nginx`, not `nginx/1.27.x`).
- **`src/utils/__tests__/dashboardUtils.test.js`** — two existing assertions
  that depended on empty-string exact equality (`cols[5]`/`cols[6]` for
  `avgResponseMs`/`peakStreak`) updated to expect the now-quoted empty field
  (`""`); new `describe` block with positive (safe values unaffected,
  substrings still present) and negative/hostile (formula-prefixed values
  defused, embedded quotes doubled, embedded commas/newlines safely quoted)
  cases.
- **`SECURITY.md`**, **`docs/ENHANCEMENTS.md`**, **`docs/DEPLOYMENT.md`** —
  synced to the shipped state; SEC-2/SEC-3/SEC-5 and the SRI note move from
  "known gap" to "done", following the strikethrough convention already
  used for SEC-1 and SEC-4.
- **`CHANGELOG.md`**, **`package.json`** — new entry, version bump.

## Tests

Same pattern as every prior SEC-n fix in this repo: a static config/text
test (no Docker required) plus a live e2e test (real Docker container),
plus unit tests for pure-function logic (CSV escaping).

- **CSP / Permissions-Policy / server_tokens**: static test extends the
  existing `nginx/security-headers.conf` describe block; live e2e test
  extends the existing per-asset-tier loop's header assertions.
- **CSV escaping**: pure unit tests on `buildCsvContent`'s output string —
  no new test infrastructure needed, extends the existing
  `dashboardUtils.test.js` file.

## Out of scope

- Tightening `style-src` beyond `'unsafe-inline'` (nonces/hashes, or
  refactoring inline styles to CSS custom properties) — audit explicitly
  defers this to a second iteration.
- HSTS — belongs at a reverse proxy in front of the container, already
  documented as a deliberate gap in `SECURITY.md`.
- `npm audit` in CI / Trivy scanning — gated on a CI pipeline that doesn't
  exist yet, tracked separately in `docs/ENHANCEMENTS.md`.
- Adding new free-text columns to the CSV export (e.g. child name) — SEC-5
  hardens the builder pre-emptively; it doesn't add the column that would
  trigger the risk.
