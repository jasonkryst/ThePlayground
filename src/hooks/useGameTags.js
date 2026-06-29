import { useMemo } from 'react'
import useSettings from './useSettings'

function warnMissingTags(manifests) {
  for (const m of manifests) {
    if (!Array.isArray(m.tags) || m.tags.length === 0) {
      console.warn(
        `[ThePlayground] Game "${m.id}" is missing a required "tags" array in its manifest.json.`
      )
    }
  }
}

export default function useGameTags(manifests) {
  const { settings } = useSettings()

  return useMemo(() => {
    warnMissingTags(manifests)
    const tagOverrides = settings.tagOverrides ?? {}
    const tagMap = new Map()
    const allTagsSet = new Set()

    for (const m of manifests) {
      const tags = tagOverrides[m.id] ?? m.tags ?? []
      tagMap.set(m.id, tags)
      for (const tag of tags) allTagsSet.add(tag)
    }

    return { tagMap, allTags: [...allTagsSet].sort() }
  }, [manifests, settings.tagOverrides])
}
