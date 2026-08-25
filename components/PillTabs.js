// PillTabs — shared pill-style tab toggle. Extracted from pages/goals.js's
// original inline Short-Term/Long-Term buttons (same exact styling, byte for
// byte) so the Life page's year toggle can reuse the identical component
// instead of a second hand-copied version — the ask was explicit: "reuse
// that component, do not build a new one." Goals' own tab row was switched
// to render through this too, so there's only ever one real implementation.
import { color, space, radius, font } from '@/lib/tokens';

export default function PillTabs({ options, activeIndex, onChange }) {
  return (
    <div style={{ display: 'flex', gap: space[2] }}>
      {options.map((label, i) => {
        const active = activeIndex === i;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(i)}
            style={{
              padding: `${space[1]} ${space[4]}`,
              borderRadius: radius.full,
              border: active ? 'none' : `1px solid ${color.muted}`,
              background: active ? color.ink : 'transparent',
              color: active ? color.white : color.muted,
              fontSize: font.size.sm,
              fontWeight: font.weight.medium,
              fontFamily: font.family,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
