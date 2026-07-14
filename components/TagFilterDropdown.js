// TagFilterDropdown — multi-select dropdown over the V3 `tags` table (each
// tag is {id, name, color}; `selected` is a Set of tag ids, not names). Zero
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

  const toggleTag = (tagId) => {
    const next = new Set(selected);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
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
                key={tag.id}
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
                <input type="checkbox" checked={selected.has(tag.id)} onChange={() => toggleTag(tag.id)} />
                {tag.color && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: radius.full,
                      background: tag.color,
                      flexShrink: 0,
                    }}
                  />
                )}
                {tag.name}
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
