// Shared tag styling utilities. Returns style objects that can be spread
// into component props. Structured as an extensible object so future
// tag-based visuals (borders, accents, text colors) are added in one place,
// not duplicated across card components.
import { color } from './tokens';

function hexToRgb(hex) {
  const cleanHex = hex.replace(/^#/, '');
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  return { r, g, b };
}

export function getTagCardStyle(tag) {
  if (!tag) return {};

  // Use tag's color if set, otherwise fall back to accent token
  const colorToUse = tag.color || color.accent;

  try {
    const { r, g, b } = hexToRgb(colorToUse);
    return {
      background: `rgba(${r}, ${g}, ${b}, 0.4)`,
    };
  } catch {
    return {};
  }
}
