import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression coverage for issue #146 (Audit #133's accessibility findings):
// two hardcoded hex colors duplicated the design-token convention (CLAUDE.md)
// instead of referencing a shared CSS custom property from src/index.css.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(__dirname, '..')

const INDEX_CSS_PATH = path.join(SRC_ROOT, 'index.css')
const GAME_CHOICE_GRID_CSS_PATH = path.join(SRC_ROOT, 'components', 'GameChoiceGrid.css')
const ANIMAL_MEMORY_MATCH_CSS_PATH = path.join(SRC_ROOT, 'games', 'animal-memory-match', 'AnimalMemoryMatchGame.css')
const SOUND_MEMORY_MATCH_CSS_PATH = path.join(SRC_ROOT, 'games', 'sound-memory-match', 'SoundMemoryMatchGame.css')

const read = p => fs.readFileSync(p, 'utf8')

describe('design token colors — --color-success (issue #146)', () => {
  it('index.css defines a --color-success token matching the prior literal', () => {
    expect(read(INDEX_CSS_PATH)).toMatch(/--color-success:\s*#a5d6a7;/)
  })

  it('index.css\'s .correct rule references the token, not a bare literal', () => {
    const css = read(INDEX_CSS_PATH)
    expect(css).toMatch(/\.correct\s*\{\s*background:\s*var\(--color-success\)\s*!important;\s*\}/)
    expect(css).not.toMatch(/\.correct\s*\{\s*background:\s*#a5d6a7/)
  })

  it('GameChoiceGrid.css\'s highlight-correct overlay references the token, not a bare literal', () => {
    const css = read(GAME_CHOICE_GRID_CSS_PATH)
    expect(css).toMatch(/background:\s*var\(--color-success\);/)
    expect(css).not.toContain('#a5d6a7')
  })
})

describe('design token colors — --color-text-muted fallback removal (issue #146)', () => {
  it.each([
    ['animal-memory-match', ANIMAL_MEMORY_MATCH_CSS_PATH],
    ['sound-memory-match', SOUND_MEMORY_MATCH_CSS_PATH],
  ])('%s no longer hardcodes a stale #666 fallback for --color-text-muted', (_name, cssPath) => {
    const css = read(cssPath)
    expect(css).toMatch(/color:\s*var\(--color-text-muted\);/)
    expect(css).not.toContain('#666')
  })
})
