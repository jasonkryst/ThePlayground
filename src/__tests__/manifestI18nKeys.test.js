import { describe, it, expect } from 'vitest'
import i18n, { SUPPORTED_LOCALES } from '../i18n'

const manifestModules = import.meta.glob('../games/*/manifest.json', { eager: true })
const manifests = Object.values(manifestModules).map(m => m.default ?? m)

describe('manifest i18n keys', () => {
  it('every manifest.nameKey resolves to a real translation in every supported locale', () => {
    for (const manifest of manifests) {
      for (const lng of SUPPORTED_LOCALES) {
        expect(i18n.exists(manifest.nameKey, { lng })).toBe(true)
      }
    }
  })

  it('every manifest.descriptionKey resolves to a real translation in every supported locale', () => {
    for (const manifest of manifests) {
      for (const lng of SUPPORTED_LOCALES) {
        expect(i18n.exists(manifest.descriptionKey, { lng })).toBe(true)
      }
    }
  })

  // Negative: catches a manifest that regresses to the old plaintext-name shape
  it('no manifest carries a literal name/description field — only nameKey/descriptionKey', () => {
    for (const manifest of manifests) {
      expect(manifest.name).toBeUndefined()
      expect(manifest.description).toBeUndefined()
      expect(manifest.nameKey).toEqual(expect.any(String))
      expect(manifest.descriptionKey).toEqual(expect.any(String))
    }
  })
})
