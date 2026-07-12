// tokens.js — Layer 1: primitives. Raw style values live ONLY here.
// Composed into semantic styles in components.js. Nothing in a component
// should reference a raw value — if it's not here, extend this file.
// Direction: clean & minimal, light theme (v1).

// Color primitives — neutral scale + one restrained accent + status hues.
export const color = {
  bg: '#ffffff',
  bgSubtle: '#f7f7f8', // panels, page background
  bgMuted: '#efeff1', // hover surfaces, inactive fills
  border: '#e4e4e7',
  borderStrong: '#d4d4d8',
  text: '#18181b',
  textMuted: '#71717a',
  textSubtle: '#a1a1aa',
  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentSubtle: '#eef2ff',
  success: '#16a34a',
  successSubtle: '#f0fdf4',
  danger: '#dc2626',
  dangerSubtle: '#fef2f2',
  warning: '#d97706',
  white: '#ffffff',
};

// Spacing scale (4px base). Keys are step multipliers, not pixels.
export const space = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
};

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  full: '9999px',
};

// Borders reference color primitives. `default` is the workhorse for all
// static containers (CLAUDE.md: static containers get border, never shadow).
export const border = {
  none: 'none',
  default: `1px solid ${color.border}`,
  strong: `1px solid ${color.borderStrong}`,
  accent: `1px solid ${color.accent}`,
};

// Elevation — shadow ONLY on overlay/interactive elements (modals, dropdowns,
// hover states). Never apply to static containers.
export const elevation = {
  none: 'none',
  hover: '0 2px 8px rgba(24, 24, 27, 0.06)',
  dropdown: '0 4px 12px rgba(24, 24, 27, 0.10)',
  modal: '0 12px 32px rgba(24, 24, 27, 0.18)',
};

export const font = {
  family:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  size: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    xxl: '28px',
  },
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.2, normal: 1.5 },
};

export const zIndex = {
  base: 0,
  dropdown: 100,
  overlay: 200,
  modal: 300,
};
