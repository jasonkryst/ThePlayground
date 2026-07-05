import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

export function mergeLocaleResources(core, gameLocaleModules) {
  const merged = { ...core }
  const owner = new Map(Object.keys(core).map(key => ['src/i18n/en.json', key]).map(([o, k]) => [k, o]))

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

const gameLocaleModules = import.meta.glob('../games/*/i18n/en.json', { eager: true })
const resources = mergeLocaleResources(en, gameLocaleModules)

i18next.use(initReactI18next).init({
  resources: { en: { translation: resources } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export const SUPPORTED_LOCALES = ['en']

export default i18next
