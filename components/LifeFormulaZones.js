// LifeFormulaZones.js — the 1-5 button-group zone cards shared by the entry
// form (pages/life-formula.js) and the Log's inline edit row
// (pages/life-formula-log.js). Extracted from life-formula.js's own
// original ENTRY-FORM RESTYLE (2026-08) so editing an existing week's
// answers looks and behaves identically to answering them the first time —
// same eyebrow pill + white card per zone, same label-left/1-5-buttons-right
// row, same immediate-write-per-click interaction — instead of the Log
// reinventing a second version of this control.
import { color, space, radius, font } from '@/lib/tokens';

// One field row: label left (12.5px medium, ink), 1-5 button-group right.
// Selecting a button calls onChange immediately — no separate confirm step;
// both callers (create form's local state, Log's per-field write) already
// expect that.
export function FieldRow({ label, value, onChange, zoneText }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[2],
        padding: `${space[1]} 0`,
      }}
    >
      <div style={{ fontSize: '12.5px', fontWeight: font.weight.medium, color: color.ink, fontFamily: font.family }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: space[1] }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${label}: ${n}`}
              aria-pressed={selected}
              style={{
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                borderRadius: radius.sm,
                border: 'none',
                background: selected ? zoneText : color.lifeFormulaButtonBg,
                color: selected ? color.white : color.muted,
                fontFamily: font.family,
                fontSize: '10.5px',
                fontWeight: font.weight.bold,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Eyebrow pill — uppercase, letter-spaced, small bold, zone bg/text, fully
// rounded. Sits above (not inside) the zone's own white card.
export function Eyebrow({ label, bg, text }) {
  return (
    <div
      style={{
        display: 'inline-block',
        background: bg,
        color: text,
        padding: `3px ${space[2]}`,
        borderRadius: radius.full,
        fontSize: '10px',
        fontWeight: font.weight.bold,
        fontFamily: font.family,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: space[2],
      }}
    >
      {label}
    </div>
  );
}

// Zone: eyebrow pill + white card (1px lifeFormulaBorder, 8px radius, 12px
// padding) containing that zone's field rows, divided by hairlines.
export function Zone({ eyebrow, bg, text, metrics, values, onChange }) {
  return (
    <div style={{ marginBottom: space[4] }}>
      <Eyebrow label={eyebrow} bg={bg} text={text} />
      <div
        style={{
          background: color.card,
          border: `1px solid ${color.lifeFormulaBorder}`,
          borderRadius: radius.lg,
          padding: space[3],
        }}
      >
        {metrics.map(([key, label], i) => (
          <div
            key={key}
            style={i < metrics.length - 1 ? { borderBottom: `1px solid ${color.lifeFormulaBorder}` } : undefined}
          >
            <FieldRow label={label} value={values[key]} onChange={(n) => onChange(key, n)} zoneText={text} />
          </div>
        ))}
      </div>
    </div>
  );
}
