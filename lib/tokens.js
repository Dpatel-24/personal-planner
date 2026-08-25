// tokens.js — Layer 1: primitives. Raw style values live ONLY here.
// Composed into semantic styles in components.js. Nothing in a component
// should reference a raw value — if it's not here, extend this file.
// Direction: V6 "Direction A" — monochrome + navy accent (2026-08).

// Color primitives — neutral scale + one restrained accent + status hues.
// V6 note: the block below (ink/paper/surface/... through tagPersonalSoft)
// is the new Direction A palette — added here first (Step 1 of the V6
// design pass) without yet being wired into components.js or any component;
// components remap onto these one at a time in Step 3, each its own
// checkpoint. The legacy keys further down (bg/text/accent/etc.) are what
// every component still actually renders with until its own Step-3 turn —
// left untouched so nothing visually changes yet. Once every consumer has
// migrated, the legacy keys become dead and should be removed (flagged for
// a future cleanup pass, not done here per this pass's own "no unrelated
// refactors" constraint).
export const color = {
  // --- V6 Direction A (monochrome + navy) ---
  // inkV6/paperV6, not ink/paper: this object already has unrelated `ink`
  // (#111110) and `paper` (#f7f6f2) keys further down (Goals/Life Formula/
  // Dashboard's own "extended palette", not part of this pass) — reusing
  // those exact names here would have silently overwritten them (later key
  // wins in a JS object literal) and shifted three unrelated pages' colors
  // with no one asking for that. Kept close to the spec's own --color-ink/
  // --color-paper naming otherwise.
  inkV6: '#1C1C1E', // primary text
  paperV6: '#FFFFFF', // page background
  surface: '#F6F6F7', // card background
  borderSubtle: '#ECECEE', // card border, dividers
  mutedText: '#999999', // secondary text, day headers, timestamps
  navy: '#1F3A5F', // navy accent — primary actions, active states, timer bar
  navySoft: '#E4EBF3', // accent tag background
  navyOn: '#FFFFFF', // text on accent surfaces
  tagAdmin: '#C4622A',
  tagAdminSoft: '#FFF1E8',
  tagPersonal: '#555555',
  tagPersonalSoft: '#F0F0F0',

  // --- Legacy (v1–v5) — still the live palette until Step 3 remaps each
  // component off of these, one at a time. Do not delete until nothing
  // below references them. ---
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

  // Extended palette — same literal hex values as the :root custom
  // properties in styles/globals.css (kept in sync by hand; see that
  // file's comment). This IS the extension of this app's one real token
  // system, not a second one — every component builds its styling from
  // this object via inline style props, same as every color above it.
  ink: '#111110',
  paper: '#f7f6f2',
  card: '#ffffff',
  muted: '#6f6e68',
  mutedFaint: '#b0afa9',
  coherenceBg: '#ededfb',
  coherenceText: '#4f39c7',
  resistanceBg: '#fbeaea',
  resistanceText: '#b93232',
  executionBg: '#ebf5ef',
  executionText: '#1a6b47',
  stateMomentum: '#1a6b47',
  stateStability: '#92510a',
  stateFriction: '#b93232',
  // Life Formula entry-form spec (2026-08) locked --color-border at a
  // different hex than this file's existing generic `border` key
  // (#e4e4e7, used app-wide) — lifeFormulaBorder, not border, so wiring
  // the entry form doesn't silently recolor every other bordered surface
  // that already consumes the generic key.
  lifeFormulaBorder: '#e5e3db',
  // Same reasoning for the 1-5 selector buttons' unselected fill — a new
  // literal from the same spec, distinct from bgMuted (#efeff1, a
  // different value already used elsewhere for hover/inactive fills).
  lifeFormulaButtonBg: '#f0efe9',
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
  // V6 Direction A single scale: 4px small tags/chips, 6px buttons/tags,
  // 7px cards. `sm`/`md` below already matched this spec exactly pre-V6, so
  // only `card` is new. `lg`/`xl` are legacy (modal, panel) — left alone
  // until Step 3 confirms what, if anything, still needs them; the spec's
  // "single scale, no other radius values" applies to the cards/buttons/tags
  // this pass actually touches, not an unrelated modal-corner change.
  sm: '4px',
  md: '6px',
  card: '7px',
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
  // Inter first, self-hosted via next/font/google (see pages/_app.js,
  // exposed as the --font-inter custom property on a wrapper div — every
  // component using this renders inside it). ONE var() call with the whole
  // fallback stack as its second argument (not a font-family LIST starting
  // with a bare var()) — see styles/globals.css's body rule for why that
  // distinction matters: without a fallback argument, var() of an
  // out-of-scope custom property is invalid and poisons the whole
  // declaration, not just that one list item.
  family:
    "var(--font-inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif)",
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
