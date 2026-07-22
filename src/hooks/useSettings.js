import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import { DEFAULT_SETTINGS } from '../storage/index'

const listeners = new Set()

function broadcast(next) {
  for (const listener of listeners) listener(next)
}

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

  useEffect(() => {
    function onSettingsChanged(next) {
      settingsRef.current = next
      setSettings(next)
    }
    listeners.add(onSettingsChanged)
    return () => listeners.delete(onSettingsChanged)
  }, [])

  async function updateSetting(key, value) {
    const next = { ...settingsRef.current, [key]: value }
    settingsRef.current = next
    setSettings(next)
    broadcast(next)
    await adapter.saveSettings(next)
  }

  async function resetSettings() {
    const next = { ...DEFAULT_SETTINGS }
    settingsRef.current = next
    setSettings(next)
    broadcast(next)
    await adapter.saveSettings(next)
  }

  return { settings, loaded, updateSetting, resetSettings }
}
