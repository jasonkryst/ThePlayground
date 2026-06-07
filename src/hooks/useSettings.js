import { useState, useEffect } from 'react'
import adapter from '../storage/index'
import { DEFAULT_SETTINGS } from '../storage/adapter'

export default function useSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS })

  useEffect(() => {
    adapter.getSettings().then(setSettings)
  }, [])

  async function updateSetting(key, value) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    await adapter.saveSettings(next)
  }

  async function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS })
    await adapter.saveSettings({ ...DEFAULT_SETTINGS })
  }

  return { settings, updateSetting, resetSettings }
}
