// WeekSprintBar — small editable bar above the Board's week header showing
// (and letting you set) that week's "sprint focus": a single free-text
// label for whatever one thing you're heavily focusing on this week (per
// lib/sprint-queries.js's week_sprints table, one row per Monday, saved
// permanently — Prev/Next shows each week's own past focus, not just the
// current one). Deliberately just a plain text input, not a picker/select —
// this is a one-line reminder to yourself, not a categorized field anything
// else in the app reads or reports on.
//
// Tinted amber (color.warning) rather than the app's usual accent purple —
// deliberately a different color from everything else on the board (tags,
// buttons, the rail's own accent borders) so it reads as its own distinct
// kind of signal, not just another purple UI element.
import { useEffect, useState } from 'react';
import { getWeekSprint, setWeekSprint } from '@/lib/sprint-queries';
import { color, space, radius, font } from '@/lib/tokens';

export default function WeekSprintBar({ weekStartStr }) {
  const [focus, setFocus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFocus('');
    getWeekSprint(weekStartStr)
      .then((row) => {
        if (cancelled) return;
        setFocus(row?.focus ?? '');
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStartStr]);

  // Saves on blur (and Enter, which just blurs) — not on every keystroke.
  // A one-line focus label doesn't need live-save; this avoids a write per
  // character while still never requiring an explicit Save button, same
  // "immediate, no gate, but not per-keystroke" balance the checklist/tag
  // pickers elsewhere in this app already strike differently for their own
  // shorter-interaction controls.
  const commit = async () => {
    setError(null);
    try {
      await setWeekSprint(weekStartStr, focus.trim());
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `${space[2]} ${space[3]}`,
        background: 'rgba(217, 119, 6, 0.12)', // color.warning at 12% opacity — same tint convention lib/tag-styles.js's getTagCardStyle() already uses
        border: `1px solid ${color.warning}`,
        borderRadius: radius.sm,
        marginBottom: space[3],
      }}
    >
      <span
        style={{
          fontSize: font.size.xs,
          fontWeight: font.weight.semibold,
          color: color.warning,
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        This week's focus
      </span>
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder={loaded ? 'What are you focusing on this week?' : 'Loading…'}
        disabled={!loaded}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          fontSize: font.size.sm,
          color: color.text,
          outline: 'none',
        }}
      />
      {error && (
        <span style={{ fontSize: font.size.xs, color: color.danger, flexShrink: 0 }}>{error}</span>
      )}
    </div>
  );
}
