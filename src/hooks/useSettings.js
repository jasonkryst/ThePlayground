import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import { DEFAULT_SETTINGS } from '../storage/index'

export default function useSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS })
  const [loaded, setLoaded] = useState(false)
  const settingsRef = useRef(settings)

  useEffect(() => {
    adapter.getSettings().then(loaded => {
      settingsRef.current = loaded
      setSettings(loaded)
      setLoaded(true)
    })
  }, [])

  async function updateSetting(key, value) {
    const next = { ...settingsRef.current, [key]: value }
    settingsRef.current = next
    setSettings(next)
    await adapter.saveSettings(next)
  }

  async function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS })
    await adapter.saveSettings({ ...DEFAULT_SETTINGS })
  }

  return { settings, loaded, updateSetting, resetSettings }
}
