import { describe, it, expect } from 'vitest'
import { buildIconMap, resolveIcon, gameIconMap } from '../gameIcons'

describe('buildIconMap', () => {
  it('maps a game id to its resolved icon url', () => {
    const map = buildIconMap([
      ['../games/character-match/icon.png', '/assets/icon-abc123.png'],
    ])
    expect(map).toEqual({ 'character-match': '/assets/icon-abc123.png' })
  })

  it('returns an empty map for no entries', () => {
    expect(buildIconMap([])).toEqual({})
  })

  it('ignores paths that are not icon.<ext> files', () => {
    const map = buildIconMap([
      ['../games/character-match/images/bg_1.webp', '/assets/bg-1.webp'],
    ])
    expect(map).toEqual({})
  })

  it('throws when a game has more than one icon file', () => {
    const entries = [
      ['../games/character-match/icon.png', '/assets/icon-a.png'],
      ['../games/character-match/icon.svg', '/assets/icon-b.svg'],
    ]
    expect(() => buildIconMap(entries)).toThrow(
      'Multiple icon files found for game "character-match": ' +
      '../games/character-match/icon.png and ../games/character-match/icon.svg. ' +
      'Each game may have at most one icon.<ext> file.'
    )
  })
})

describe('resolveIcon', () => {
  it('returns the mapped image url when the game has an icon file', () => {
    const iconMap = { 'character-match': '/assets/icon-abc123.png' }
    expect(resolveIcon({ id: 'character-match', icon: '🎭' }, iconMap)).toBe('/assets/icon-abc123.png')
  })

  it('falls back to the manifest emoji when the game has no icon file', () => {
    expect(resolveIcon({ id: 'animal-sounds', icon: '🐘' }, {})).toBe('🐘')
  })
})

describe('gameIconMap (live filesystem)', () => {
  it('has no icon for a game with no icon file', () => {
    expect(gameIconMap['animal-sounds']).toBeUndefined()
  })

  it('resolves an image url for a game with an icon file', () => {
    expect(gameIconMap['character-match']).toMatch(/\.png$/)
  })

  it('resolves an image url for a second game with an icon file', () => {
    expect(gameIconMap['character-match-bluey']).toMatch(/\.webp$/)
  })
})
