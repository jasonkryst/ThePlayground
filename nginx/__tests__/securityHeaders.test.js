import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const NGINX_CONF_PATH = path.join(REPO_ROOT, 'nginx.conf')
const SECURITY_HEADERS_CONF_PATH = path.join(REPO_ROOT, 'nginx', 'security-headers.conf')
const DOCKERFILE_PATH = path.join(REPO_ROOT, 'Dockerfile')

const SECURITY_HEADERS_INCLUDE_MARKER = 'security-headers.conf'
const REQUIRED_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
]

// Permissions-Policy's value contains regex metacharacters ( ) , that the
// original three header values didn't — escape before building a pattern.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * nginx does not merge `add_header` directives across nesting levels (see
 * SEC-1, docs/superpowers/specs/2026-07-12-security-audit-findings.md): a
 * `location` block that declares its own `add_header` silently loses every
 * add_header inherited from its enclosing `server` block. This scans each
 * top-level `location` block and flags any that sets its own add_header
 * without also `include`-ing the shared security-headers snippet.
 *
 * Deliberately simple (no nested-brace handling) - this file's location
 * blocks never nest braces in their bodies.
 */
function findLocationsMissingSecurityHeaders(confText) {
  const locationBlocks = [...confText.matchAll(/location\s+([^{]*)\{([^{}]*)\}/g)]
  return locationBlocks
    .filter(([, , body]) => /add_header/i.test(body))
    .filter(([, , body]) => !body.includes(SECURITY_HEADERS_INCLUDE_MARKER))
    .map(([, selector]) => selector.trim())
}

describe('findLocationsMissingSecurityHeaders (validator)', () => {
  it('flags a location block that sets add_header without including the security-headers snippet', () => {
    const broken = `
      server {
        location ~* \\.(js|css)$ {
          expires 1y;
          add_header Cache-Control "public, immutable";
        }
      }
    `
    expect(findLocationsMissingSecurityHeaders(broken)).toEqual(['~* \\.(js|css)$'])
  })

  it('does not flag a location block that sets add_header and includes the security-headers snippet', () => {
    const fixed = `
      server {
        location ~* \\.(js|css)$ {
          expires 1y;
          add_header Cache-Control "public, immutable";
          include /etc/nginx/security-headers.conf;
        }
      }
    `
    expect(findLocationsMissingSecurityHeaders(fixed)).toEqual([])
  })

  it('does not flag a location block with no add_header of its own (relies on inheritance)', () => {
    const inheriting = `
      server {
        location / {
          try_files $uri $uri/ /index.html;
        }
      }
    `
    expect(findLocationsMissingSecurityHeaders(inheriting)).toEqual([])
  })
})

describe('nginx.conf', () => {
  const confText = fs.readFileSync(NGINX_CONF_PATH, 'utf8')

  it('does not silently drop security headers in any location block', () => {
    expect(findLocationsMissingSecurityHeaders(confText)).toEqual([])
  })
})

describe('nginx/security-headers.conf', () => {
  it('exists and declares all required security headers with `always`', () => {
    const snippetText = fs.readFileSync(SECURITY_HEADERS_CONF_PATH, 'utf8')
    for (const [name, value] of REQUIRED_HEADERS) {
      const pattern = new RegExp(`add_header\\s+${escapeRegExp(name)}\\s+"${escapeRegExp(value)}"\\s+always;`)
      expect(snippetText).toMatch(pattern)
    }
  })

  it('is copied into the image at the exact absolute path nginx.conf includes', () => {
    const dockerfileText = fs.readFileSync(DOCKERFILE_PATH, 'utf8')
    const copyMatch = dockerfileText.match(
      /COPY\s+nginx\/security-headers\.conf\s+(\S+)/
    )
    expect(copyMatch, 'Dockerfile must COPY nginx/security-headers.conf somewhere').not.toBeNull()

    const imagePath = copyMatch[1]
    const confText = fs.readFileSync(NGINX_CONF_PATH, 'utf8')
    const includeLines = [...confText.matchAll(/include\s+(\S+security-headers\.conf)\s*;/g)]
    expect(includeLines.length, 'nginx.conf must include the security-headers snippet').toBeGreaterThan(0)
    for (const [, includedPath] of includeLines) {
      expect(includedPath).toBe(imagePath)
    }
  })
})

/**
 * Guards SEC-2 (docs/superpowers/specs/2026-07-12-security-audit-findings.md):
 * extracts the raw Content-Security-Policy header value from
 * nginx/security-headers.conf so directive-level assertions don't depend on
 * the exact ordering/formatting of the full policy string.
 */
function extractCspValue(snippetText) {
  const match = snippetText.match(/add_header\s+Content-Security-Policy\s+"([^"]+)"\s+always;/)
  return match ? match[1] : null
}

describe('Content-Security-Policy (SEC-2)', () => {
  const snippetText = fs.readFileSync(SECURITY_HEADERS_CONF_PATH, 'utf8')
  const csp = extractCspValue(snippetText)

  it('is declared with `always`', () => {
    expect(csp).not.toBeNull()
  })

  it.each([
    `default-src 'self'`,
    `script-src 'self' https://www.googletagmanager.com`,
    `connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com`,
    `img-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'self'`,
  ])('includes the directive: %s', (directive) => {
    expect(csp).toContain(directive)
  })

  it('does not allow inline or eval script execution (no unsafe-inline/unsafe-eval on script-src)', () => {
    const scriptSrc = csp.match(/script-src ([^;]+)/)[1]
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
  })

  it('does not allow any wildcard host in default-src (would defeat the policy)', () => {
    const defaultSrc = csp.match(/default-src ([^;]+)/)[1]
    expect(defaultSrc).not.toContain('*')
  })
})

describe('server_tokens off (SEC-3)', () => {
  it('nginx.conf disables server_tokens so the nginx version is not disclosed', () => {
    const confText = fs.readFileSync(NGINX_CONF_PATH, 'utf8')
    expect(confText).toMatch(/server_tokens\s+off;/)
  })
})

/**
 * Guards SEC-4 (docs/superpowers/specs/2026-07-12-security-audit-findings.md):
 * a floating base-image tag (`alpine`, `latest`, no tag at all) makes builds
 * non-reproducible and silently inherits upstream regressions. Accepts a
 * tag containing a version number (major, or major.minor, or major.minor.patch)
 * or a `@sha256:` digest pin.
 */
function isPinnedImageTag(image) {
  if (/@sha256:[0-9a-f]{64}$/i.test(image)) return true
  const tagMatch = image.match(/:([^:]+)$/)
  if (!tagMatch) return false
  const tag = tagMatch[1]
  if (tag === 'latest') return false
  return /\d/.test(tag)
}

describe('isPinnedImageTag (validator)', () => {
  it('accepts a major.minor pinned tag', () => {
    expect(isPinnedImageTag('nginx:1.27-alpine')).toBe(true)
  })

  it('accepts a digest-pinned image', () => {
    expect(isPinnedImageTag(`nginx@sha256:${'a'.repeat(64)}`)).toBe(true)
  })

  it('rejects a floating alias tag with no version (e.g. nginx:alpine)', () => {
    expect(isPinnedImageTag('nginx:alpine')).toBe(false)
  })

  it('rejects an explicit latest tag', () => {
    expect(isPinnedImageTag('node:latest')).toBe(false)
  })

  it('rejects an image with no tag at all', () => {
    expect(isPinnedImageTag('nginx')).toBe(false)
  })
})

describe('Dockerfile image pinning and non-root runtime (SEC-4)', () => {
  const dockerfileText = fs.readFileSync(DOCKERFILE_PATH, 'utf8')
  const fromImages = [...dockerfileText.matchAll(/^FROM\s+(\S+)/gm)].map(([, image]) => image)

  it('pins every FROM image to a specific version (no floating tags)', () => {
    expect(fromImages.length).toBeGreaterThan(0)
    for (const image of fromImages) {
      expect(isPinnedImageTag(image), `${image} is not pinned to a version`).toBe(true)
    }
  })

  it('runs the runtime (final) stage on the non-root nginx-unprivileged image', () => {
    const runtimeImage = fromImages[fromImages.length - 1]
    expect(runtimeImage.startsWith('nginxinc/nginx-unprivileged:')).toBe(true)
  })
})
