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
]

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
  it('exists and declares all three required security headers with `always`', () => {
    const snippetText = fs.readFileSync(SECURITY_HEADERS_CONF_PATH, 'utf8')
    for (const [name, value] of REQUIRED_HEADERS) {
      const pattern = new RegExp(`add_header\\s+${name}\\s+"${value}"\\s+always;`)
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
