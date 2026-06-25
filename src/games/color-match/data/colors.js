// textColor is the higher-contrast of black/white against each swatch (WCAG AA, >= 4.5:1)
// so choice labels stay readable regardless of how light or dark the taught color is.
const colors = [
  { id: 'red',       nameKey: 'color.red.name',    color: '#E53935', emoji: '🍎', textColor: '#000000' },
  { id: 'orange',    nameKey: 'color.orange.name', color: '#FB8C00', emoji: '🍊', textColor: '#000000' },
  { id: 'yellow',    nameKey: 'color.yellow.name', color: '#FDD835', emoji: '🍌', textColor: '#000000' },
  { id: 'green',     nameKey: 'color.green.name',  color: '#43A047', emoji: '🍃', textColor: '#000000' },
  { id: 'blue',      nameKey: 'color.blue.name',   color: '#1E88E5', emoji: '🫐', textColor: '#000000' },
  { id: 'purple',    nameKey: 'color.purple.name', color: '#8E24AA', emoji: '🍇', textColor: '#ffffff' },
  { id: 'pink',      nameKey: 'color.pink.name',   color: '#F06292', emoji: '🌸', textColor: '#000000' },
  { id: 'brown',     nameKey: 'color.brown.name',  color: '#6D4C41', emoji: '🌰', textColor: '#ffffff' },
  { id: 'black',     nameKey: 'color.black.name',  color: '#212121', emoji: '🎩', textColor: '#ffffff' },
  { id: 'white',     nameKey: 'color.white.name',  color: '#FAFAFA', emoji: '☁️', textColor: '#000000' },
  { id: 'gray',      nameKey: 'color.gray.name',   color: '#9E9E9E', emoji: '🪨', textColor: '#000000' },
]

export default colors
