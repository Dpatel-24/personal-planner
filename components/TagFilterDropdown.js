// TagFilterDropdown — multi-select dropdown of distinct tag values. Zero
// selected = no filtering (show everything); one or more selected = show
// tasks matching ANY selected tag. Closes on an outside click; stays open
// while checking boxes (standard multi-select behavior).
import { useEffect, useRef, useState } from 'react';
import { color, space, radius, border, font, elevation, zIndex } from '@/lib/tokens';
import { buttonSecondary } from '@/lib/components';

export default function TagFilterDropdown({ tags, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const toggleTag = (tag) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(next);
  };

  const label = selected.size === 0 ? 'Tags' : `Tags (${selected.size})`;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button type="button" style={buttonSecondary} onClick={() => setOpen((o) => !o)}>
        {label} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: space[1],
            minWidth: 180,
            background: color.white,
            border: border.default,
            borderRadius: radius.md,
            boxShadow: elevation.dropdown,
            zIndex: zIndex.dropdown,
            padding: space[2],
          }}
        >
          {tags.length === 0 ? (
            <div style={{ fontSize: font.size.sm, color: color.textMuted, padding: space[1] }}>
              No tags yet.
            </div>
          ) : (
            tags.map((tag) => (
              <label
                key={tag}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space[2],
                  padding: `${space[1]} ${space[1]}`,
                  fontSize: font.size.sm,
                  color: color.text,
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={selected.has(tag)} onChange={() => toggleTag(tag)} />
                {tag}
              </label>
            ))
          )}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              style={{
                marginTop: space[1],
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: color.accent,
                fontSize: font.size.xs,
                fontFamily: font.family,
                cursor: 'pointer',
                padding: space[1],
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
