import '../src/index.css'
import '../src/i18n'

const disableMotionStyle = document.createElement('style')
disableMotionStyle.innerHTML = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
document.head.appendChild(disableMotionStyle)

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: { expanded: true },
  },
  decorators: [
    (Story, context) => {
      const theme = context.parameters.theme
      if (theme) {
        document.documentElement.dataset.theme = theme
      } else {
        delete document.documentElement.dataset.theme
      }
      return Story()
    },
  ],
}

export default preview
