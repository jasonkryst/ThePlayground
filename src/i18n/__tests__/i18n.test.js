import { describe, it, expect } from 'vitest'
import i18n, { mergeLocaleResources, groupModulesByLocale, buildResources, SUPPORTED_LOCALES } from '../index'

describe('i18n', () => {
  it('initializes synchronously with English resources', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('common.home')).toBe('Home')
  })

  it('falls back to the key when a translation is missing', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist')
  })

  it('exports SUPPORTED_LOCALES derived from what was actually discovered, not a hardcoded list', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'es', 'pl'])
  })

  it('resolves a known es key to its Spanish translation', () => {
    expect(i18n.t('common.home', { lng: 'es' })).toBe('Inicio')
  })

  it('pluralizes common.difficultyOfferHeading correctly for singular and plural counts', () => {
    expect(i18n.t('common.difficultyOfferHeading', { count: 1 })).toBe(
      'Perfect session! Try 1 choice next time?'
    )
    expect(i18n.t('common.difficultyOfferHeading', { count: 3 })).toBe(
      'Perfect session! Try 3 choices next time?'
    )
  })

  it('resolves a known pl key to its Polish translation', () => {
    expect(i18n.t('common.home', { lng: 'pl' })).toBe('Strona główna')
  })

  it('pluralizes common.difficultyOfferHeading with all four Polish plural categories', () => {
    expect(i18n.t('common.difficultyOfferHeading', { count: 1, lng: 'pl' })).toBe(
      'Świetna sesja! Spróbować 1 opcję następnym razem?'
    )
    expect(i18n.t('common.difficultyOfferHeading', { count: 3, lng: 'pl' })).toBe(
      'Świetna sesja! Spróbować 3 opcje następnym razem?'
    )
    expect(i18n.t('common.difficultyOfferHeading', { count: 5, lng: 'pl' })).toBe(
      'Świetna sesja! Spróbować 5 opcji następnym razem?'
    )
  })

  it('falls back to the Polish "other" plural form for a non-integer count instead of the raw key', () => {
    expect(i18n.t('common.difficultyOfferHeading', { count: 1.5, lng: 'pl' })).toBe(
      'Świetna sesja! Spróbować 1.5 opcji następnym razem?'
    )
  })
})

describe('html lang sync', () => {
  it('sets document.documentElement.lang to the active language on init', () => {
    expect(document.documentElement.lang).toBe(i18n.language)
  })

  it('updates document.documentElement.lang when the language changes', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
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

describe('groupModulesByLocale', () => {
  it('groups modules by the locale code in their filename', () => {
    const modules = {
      './en.json': { common: {} },
      '../games/foo/i18n/en.json': { default: { foo: true } },
      '../games/foo/i18n/es.json': { default: { foo: 'es' } },
    }
    const grouped = groupModulesByLocale(modules)
    expect(Object.keys(grouped).sort()).toEqual(['en', 'es'])
    expect(Object.keys(grouped.en).sort()).toEqual(['../games/foo/i18n/en.json', './en.json'])
    expect(Object.keys(grouped.es)).toEqual(['../games/foo/i18n/es.json'])
  })
})

describe('buildResources', () => {
  it('builds one merged resource bundle per discovered locale', () => {
    const coreModules = {
      './en.json': { common: { home: 'Home' } },
      './es.json': { common: { home: 'Inicio' } },
    }
    const gameModules = {
      '../games/foo/i18n/en.json': { default: { foo: { prompt: 'Pick foo' } } },
      '../games/foo/i18n/es.json': { default: { foo: { prompt: 'Elige foo' } } },
    }
    const resources = buildResources(coreModules, gameModules)
    expect(Object.keys(resources).sort()).toEqual(['en', 'es'])
    expect(resources.en.translation).toEqual({ common: { home: 'Home' }, foo: { prompt: 'Pick foo' } })
    expect(resources.es.translation).toEqual({ common: { home: 'Inicio' }, foo: { prompt: 'Elige foo' } })
  })

  it('supports a locale that exists only via a game file, with no matching core file', () => {
    const coreModules = { './en.json': { common: {} } }
    const gameModules = { '../games/foo/i18n/fr.json': { default: { foo: { prompt: 'Choisis' } } } }
    const resources = buildResources(coreModules, gameModules)
    expect(resources.fr.translation).toEqual({ foo: { prompt: 'Choisis' } })
  })
})

function collectLeafPaths(obj, prefix = '') {
  const paths = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') paths.push(...collectLeafPaths(value, path))
    else paths.push(path)
  }
  return paths
}

const PLURAL_SUFFIX_RE = /_(?:one|few|many|other)$/

function toBaseKey(path) {
  return path.replace(PLURAL_SUFFIX_RE, '')
}

function baseKeySet(locale) {
  return [...new Set(collectLeafPaths(i18n.getResourceBundle(locale, 'translation')).map(toBaseKey))].sort()
}

function pluralSuffixesFor(locale, basePath) {
  return collectLeafPaths(i18n.getResourceBundle(locale, 'translation'))
    .filter(p => p.startsWith(basePath) && PLURAL_SUFFIX_RE.test(p))
    .map(p => p.match(PLURAL_SUFFIX_RE)[0].slice(1))
    .sort()
}

describe('cross-locale key parity', () => {
  it('has the exact same set of base translation keys in en, es, and pl across core + every game', () => {
    const enKeys = baseKeySet('en')
    expect(baseKeySet('es')).toEqual(enKeys)
    expect(baseKeySet('pl')).toEqual(enKeys)
  })

  it('en and es define exactly the one/other plural forms for pluralizable keys', () => {
    expect(pluralSuffixesFor('en', 'common.difficultyOfferHeading')).toEqual(['one', 'other'])
    expect(pluralSuffixesFor('es', 'common.difficultyOfferHeading')).toEqual(['one', 'other'])
    expect(pluralSuffixesFor('en', 'gameCard.playCount')).toEqual(['one', 'other'])
    expect(pluralSuffixesFor('es', 'gameCard.playCount')).toEqual(['one', 'other'])
  })

  it('pl defines all four CLDR plural forms for pluralizable keys', () => {
    expect(pluralSuffixesFor('pl', 'common.difficultyOfferHeading')).toEqual(['few', 'many', 'one', 'other'])
    expect(pluralSuffixesFor('pl', 'gameCard.playCount')).toEqual(['few', 'many', 'one', 'other'])
  })
})
