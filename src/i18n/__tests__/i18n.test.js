import { describe, it, expect } from 'vitest'
import i18n, { mergeLocaleResources } from '../index'

describe('i18n', () => {
  it('initializes synchronously with English resources', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('common.home')).toBe('Home')
  })

  it('falls back to the key when a translation is missing', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist')
  })
})

describe('mergeLocaleResources', () => {
  it('merges core resources with every game locale file', () => {
    const core = { common: { home: 'Home' } }
    const gameModules = {
      '../games/foo/i18n/en.json': { default: { foo: { prompt: 'Pick foo' } } },
      '../games/bar/i18n/en.json': { bar: { prompt: 'Pick bar' } }, // no .default — plain object shape
    }
    const merged = mergeLocaleResources(core, gameModules)
    expect(merged).toEqual({
      common: { home: 'Home' },
      foo: { prompt: 'Pick foo' },
      bar: { prompt: 'Pick bar' },
    })
  })

  it('throws when a game namespace collides with a core key', () => {
    const core = { common: { home: 'Home' } }
    const gameModules = { '../games/foo/i18n/en.json': { default: { common: { home: 'Oops' } } } }
    expect(() => mergeLocaleResources(core, gameModules)).toThrow(/collision/i)
  })

  it('throws when two game namespaces collide with each other', () => {
    const core = {}
    const gameModules = {
      '../games/foo/i18n/en.json': { default: { shared: {} } },
      '../games/bar/i18n/en.json': { default: { shared: {} } },
    }
    expect(() => mergeLocaleResources(core, gameModules)).toThrow(/collision/i)
  })

  it('does not mutate the core object it was given', () => {
    const core = { common: { home: 'Home' } }
    mergeLocaleResources(core, { '../games/foo/i18n/en.json': { default: { foo: {} } } })
    expect(core).toEqual({ common: { home: 'Home' } })
  })
})
