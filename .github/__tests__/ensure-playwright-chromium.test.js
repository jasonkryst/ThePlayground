// @vitest-environment node
//
// Behavioural tests for scripts/ci/ensure-playwright-chromium.sh (issue #268).
// The script runs for real under bash; `npx`, `node`, `timeout` and `sleep`
// are replaced with bash functions loaded via BASH_ENV (sourced by
// non-interactive bash before the script runs), so no network, browser or
// apt is touched and the production script needs no test-only seams.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'ci', 'ensure-playwright-chromium.sh')

// On Windows, `bash` on PATH is often WSL's launcher, not Git Bash — resolve
// Git Bash from git's own install location instead.
function findBash() {
  if (process.platform !== 'win32') return 'bash'
  try {
    const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
    // <git>/mingw64/libexec/git-core -> <git>/bin/bash.exe
    const candidate = path.resolve(execPath, '..', '..', '..', 'bin', 'bash.exe')
    return fs.existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}
const BASH = findBash()

const toBashPath = p => p.replace(/\\/g, '/')

const FAKES = `
log() { printf '%s\\n' "$*" >> "$FAKE_LOG"; }
count() { local f="$FAKE_DIR/$1"; local n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$f"; echo "$n"; }
npx() {
  log "npx $*"
  case "$*" in
    "playwright install chromium") return "\${FAKE_DOWNLOAD_RC:-0}" ;;
    "playwright install-deps chromium")
      local n; n=$(count apt)
      # FAKE_APT: ok | fail | fail-then-ok | ok-but-still-broken
      case "\${FAKE_APT:-ok}" in
        ok) touch "$FAKE_DIR/libs" ; return 0 ;;
        ok-but-still-broken) return 0 ;;
        fail) return 100 ;;
        fail-then-ok) if [ "$n" -ge 2 ]; then touch "$FAKE_DIR/libs"; return 0; fi; return 100 ;;
      esac ;;
  esac
  return 99
}
node() {
  log "node launch-check"
  if [ "\${FAKE_LAUNCH_OK:-0}" = 1 ] || [ -e "$FAKE_DIR/libs" ]; then return 0; fi
  echo "browserType.launch: error while loading shared libraries: libnss3.so" >&2
  return 1
}
timeout() { log "timeout $1"; shift; "$@"; }
sleep() { log "sleep $1"; }
`

let dir
function run(env = {}) {
  const fakesFile = path.join(dir, 'fakes.sh')
  fs.writeFileSync(fakesFile, FAKES)
  const res = spawnSync(BASH, [toBashPath(SCRIPT)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASH_ENV: toBashPath(fakesFile),
      FAKE_DIR: toBashPath(dir),
      FAKE_LOG: toBashPath(path.join(dir, 'calls.log')),
      ...env,
    },
  })
  const logFile = path.join(dir, 'calls.log')
  const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n') : []
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, calls }
}
const aptCalls = calls => calls.filter(c => c === 'npx playwright install-deps chromium').length

describe.skipIf(!BASH)('scripts/ci/ensure-playwright-chromium.sh (issue #268)', () => {
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ensure-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('is checked out with LF line endings (CRLF breaks bash on Windows checkouts)', () => {
    expect(fs.readFileSync(SCRIPT, 'utf8')).not.toContain('\r\n')
  })

  it('downloads the browser without --with-deps', () => {
    const { calls } = run({ FAKE_LAUNCH_OK: '1' })
    expect(calls[0]).toBe('npx playwright install chromium')
    expect(calls.join('\n')).not.toContain('--with-deps')
  })

  it('skips apt entirely when Chromium launches with the runner’s existing libraries', () => {
    const { status, stdout, calls } = run({ FAKE_LAUNCH_OK: '1' })
    expect(status).toBe(0)
    expect(aptCalls(calls)).toBe(0)
    expect(stdout).toMatch(/skipping apt/i)
  })

  it('falls back to playwright install-deps when the launch fails, then succeeds', () => {
    const { status, stdout, calls } = run({ FAKE_APT: 'ok' })
    expect(status).toBe(0)
    expect(aptCalls(calls)).toBe(1)
    expect(calls.filter(c => c === 'node launch-check')).toHaveLength(2)
    expect(stdout).toContain('::warning::')
    expect(stdout).not.toContain('::error::')
  })

  it('bounds each apt attempt with a 600s timeout by default', () => {
    const { calls } = run({ FAKE_APT: 'ok' })
    expect(calls).toContain('timeout 600')
  })

  it('retries apt once after a delay when the first attempt fails', () => {
    const { status, calls } = run({ FAKE_APT: 'fail-then-ok' })
    expect(status).toBe(0)
    expect(aptCalls(calls)).toBe(2)
    expect(calls).toContain('sleep 15')
  })

  it('negative: fails with a clear ::error:: (not a hang) when libraries are missing and apt is down', () => {
    const { status, stdout, calls } = run({ FAKE_APT: 'fail' })
    expect(status).toBe(1)
    expect(stdout).toMatch(/::error::Chromium can't launch and apt couldn't install its libraries/)
    expect(aptCalls(calls)).toBe(2)
  })

  it('negative: does not sleep after the final failed apt attempt', () => {
    const { calls } = run({ FAKE_APT: 'fail' })
    expect(calls.filter(c => c.startsWith('sleep'))).toHaveLength(1)
  })

  it('negative: fails with ::error:: when apt reports success but Chromium still cannot launch', () => {
    const { status, stdout } = run({ FAKE_APT: 'ok-but-still-broken' })
    expect(status).toBe(1)
    expect(stdout).toContain('::error::')
  })

  it('negative: fails fast with ::error:: when the browser download itself fails, without trying apt', () => {
    const { status, stdout, calls } = run({ FAKE_DOWNLOAD_RC: '1' })
    expect(status).toBe(1)
    expect(stdout).toMatch(/::error::Downloading Playwright's Chromium failed/)
    expect(aptCalls(calls)).toBe(0)
    expect(calls).not.toContain('node launch-check')
  })

  it('honours APT_ATTEMPTS / APT_TIMEOUT_SECONDS overrides', () => {
    const { calls } = run({ FAKE_APT: 'fail', APT_ATTEMPTS: '3', APT_TIMEOUT_SECONDS: '42' })
    expect(aptCalls(calls)).toBe(3)
    expect(calls).toContain('timeout 42')
  })
})
