import OrientationOverlay from './OrientationOverlay'

export default {
  title: 'Components/OrientationOverlay',
  component: OrientationOverlay,
  // The overlay positions absolutely against its gate container in the app;
  // give the story an equivalent positioned box so it has size to fill.
  decorators: [
    Story => (
      <div style={{ position: 'relative', height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
}

export const Default = {}
