import { describe, it, expect } from 'vitest'
import i18n from '../index'

describe('i18n', () => {
  it('initializes synchronously with English resources', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('common.home')).toBe('Home')
  })

  it('falls back to the key when a translation is missing', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist')
  })
})
