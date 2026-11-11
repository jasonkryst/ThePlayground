#!/usr/bin/env bash
# Install Playwright's Chromium for CI, treating apt as a fallback (issue #268).
#
# `npx playwright install --with-deps chromium` runs apt on every job, so CI
# fails whenever the Ubuntu package mirror is unreachable (2026-11-11:
# `Temporary failure resolving 'azure.archive.ubuntu.com'` for hours) — even
# though GitHub's ubuntu-latest image already ships Chromium's shared
# libraries. Instead:
#   1. download the browser only (no apt);
#   2. try launching headless Chromium once — normally this passes and apt
#      never runs;
#   3. only if the launch fails, run `playwright install-deps` under a
#      timeout, retrying once, then re-check and fail with a clear
#      `::error::` rather than hanging.
#
# Tunables (env): APT_TIMEOUT_SECONDS (default 600), APT_ATTEMPTS (default 2),
# APT_RETRY_DELAY_SECONDS (default 15).
set -uo pipefail

APT_TIMEOUT_SECONDS="${APT_TIMEOUT_SECONDS:-600}"
APT_ATTEMPTS="${APT_ATTEMPTS:-2}"
APT_RETRY_DELAY_SECONDS="${APT_RETRY_DELAY_SECONDS:-15}"

chromium_launches() {
  node -e "require('@playwright/test').chromium.launch().then(b => b.close()).catch(e => { console.error(String(e && e.message || e).split('\n')[0]); process.exit(1) })"
}

if ! npx playwright install chromium; then
  echo "::error::Downloading Playwright's Chromium failed (npx playwright install chromium)"
  exit 1
fi

if chromium_launches; then
  echo "Chromium launches with the runner's existing libraries; skipping apt (playwright install-deps)."
  exit 0
fi

echo "::warning::Chromium failed to launch; installing its system libraries via apt (playwright install-deps)."
for attempt in $(seq 1 "$APT_ATTEMPTS"); do
  if timeout "$APT_TIMEOUT_SECONDS" npx playwright install-deps chromium; then
    break
  fi
  echo "playwright install-deps attempt ${attempt}/${APT_ATTEMPTS} failed."
  if [ "$attempt" -lt "$APT_ATTEMPTS" ]; then
    sleep "$APT_RETRY_DELAY_SECONDS"
  fi
done

if chromium_launches; then
  echo "Chromium launches after installing its system libraries."
  exit 0
fi

echo "::error::Chromium can't launch and apt couldn't install its libraries (playwright install-deps failed or didn't fix it)."
exit 1
