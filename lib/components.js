// components.js — Layer 2: semantic style objects composed from tokens.
// Components consume these; they never touch raw token values directly, and
// never inline raw style values. Extend tokens.js first if a value is missing.
import { color, space, radius, border, elevation, font, zIndex } from './tokens';

// --- Surfaces --------------------------------------------------------------

// Static container — border, never shadow.
export const card = {
  background: color.bg,
  border: border.default,
  borderRadius: radius.lg,
  padding: space[4],
};

// Static grouping surface (slightly recessed).
export const panel = {
  background: color.bgSubtle,
  border: border.default,
  borderRadius: radius.lg,
  padding: space[4],
};

// Overlay surface — interactive, so shadow is allowed.
export const modal = {
  background: color.bg,
  border: border.default,
  borderRadius: radius.xl,
  padding: space[6],
  boxShadow: elevation.modal,
  zIndex: zIndex.modal,
};

export const overlayBackdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(24, 24, 27, 0.40)',
  zIndex: zIndex.overlay,
};

// --- Inputs ----------------------------------------------------------------

export const input = {
  width: '100%',
  boxSizing: 'border-box',
  background: color.white,
  border: border.default,
  borderRadius: radius.md,
  padding: `${space[2]} ${space[3]}`,
  fontSize: font.size.md,
  fontFamily: font.family,
  color: color.text,
  outline: 'none',
};

export const label = {
  display: 'block',
  marginBottom: space[1],
  fontSize: font.size.sm,
  fontWeight: font.weight.medium,
  color: color.textMuted,
};

// --- Buttons ---------------------------------------------------------------

const buttonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[1],
  borderRadius: radius.md,
  padding: `${space[2]} ${space[4]}`,
  fontSize: font.size.md,
  fontWeight: font.weight.medium,
  fontFamily: font.family,
  lineHeight: font.lineHeight.tight,
  cursor: 'pointer',
  border: border.none,
};

export const buttonPrimary = {
  ...buttonBase,
  background: color.accent,
  color: color.white,
};

export const buttonSecondary = {
  ...buttonBase,
  background: color.white,
  color: color.text,
  border: border.default,
};

export const buttonGhost = {
  ...buttonBase,
  background: 'transparent',
  color: color.textMuted,
};

export const buttonDanger = {
  ...buttonBase,
  background: color.dangerSubtle,
  color: color.danger,
  border: border.default,
};

// --- Text ------------------------------------------------------------------

export const heading = {
  margin: 0,
  fontFamily: font.family,
  fontSize: font.size.xl,
  fontWeight: font.weight.semibold,
  color: color.text,
};

export const textMuted = {
  fontFamily: font.family,
  fontSize: font.size.sm,
  color: color.textMuted,
};
