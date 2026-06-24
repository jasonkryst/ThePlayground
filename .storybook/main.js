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
