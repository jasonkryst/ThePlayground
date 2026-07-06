import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

export function mergeLocaleResources(core, gameLocaleModules, corePath = 'src/i18n/en.json') {
  const merged = { ...core }
  const owner = new Map(Object.keys(core).map(key => [key, corePath]))

  for (const [path, mod] of Object.entries(gameLocaleModules)) {
    const locale = mod.default ?? mod
    for (const key of Object.keys(locale)) {
      if (owner.has(key)) {
        throw new Error(`i18n namespace collision: "${key}" is defined in both ${owner.get(key)} and ${path}`)
      }
      owner.set(key, path)
      merged[key] = locale[key]
    }
  }

  return merged
}

export function groupModulesByLocale(modules) {
  const byLocale = {}
  for (const [path, mod] of Object.entries(modules)) {
    const locale = path.match(/([^/]+)\.json$/)[1]
    byLocale[locale] = { ...(byLocale[locale] ?? {}), [path]: mod }
  }
  return byLocale
}

export function buildResources(coreModules, gameLocaleModules) {
  const coreByLocale = groupModulesByLocale(coreModules)
  const gameByLocale = groupModulesByLocale(gameLocaleModules)
  const allLocaleCodes = new Set([...Object.keys(coreByLocale), ...Object.keys(gameByLocale)])

  const resources = {}
  for (const locale of allLocaleCodes) {
    const [corePath, coreModule] = Object.entries(coreByLocale[locale] ?? {})[0] ?? []
    const core = coreModule ? (coreModule.default ?? coreModule) : {}
    resources[locale] = {
      translation: mergeLocaleResources(core, gameByLocale[locale] ?? {}, corePath ?? `src/i18n/${locale}.json`),
    }
  }
  return resources
}

const coreModules = import.meta.glob('./*.json', { eager: true })
const gameLocaleModules = import.meta.glob('../games/*/i18n/*.json', { eager: true })
const resources = buildResources(coreModules, gameLocaleModules)

i18next.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

function syncHtmlLang(lng) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
i18next.on('languageChanged', syncHtmlLang)
syncHtmlLang(i18next.language)

export const SUPPORTED_LOCALES = Object.keys(resources)

export default i18next
