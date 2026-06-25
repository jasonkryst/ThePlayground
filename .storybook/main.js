// Repo lives on a network share; Storybook's own story-indexer watcher
// (separate from Vite's dev-server watcher below) uses chokidar directly
// and races on native fs events there, intermittently producing partial
// file reads ("Could not parse expression with acorn") for *.stories.jsx
// files unrelated to whatever just changed. CHOKIDAR_USEPOLLING is the
// env var chokidar itself honors globally, so this covers the indexer's
// watcher too, not just Vite's.
process.env.CHOKIDAR_USEPOLLING = 'true'

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Repo lives on a network share; native fs watchers crash with
  // "UNKNOWN: unknown error, watch" there. Mirror the polling watcher
  // already used in vite.config.js so the Storybook dev server is stable.
  viteFinal: async (viteConfig) => {
    viteConfig.server = {
      ...viteConfig.server,
      watch: {
        ...viteConfig.server?.watch,
        usePolling: true,
        interval: 300,
      },
    }
    return viteConfig
  },
}

export default config
