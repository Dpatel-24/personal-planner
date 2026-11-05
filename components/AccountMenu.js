// AccountMenu — small "Account" dropdown at the end of AppNav: lock now,
// set/change PIN, remove PIN, sign out. Actions come from AuthGate's context.
import { useEffect, useRef, useState } from 'react';
import { color, space, radius, font, elevation } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';
import { useAuth } from './AuthGate';

export default function AccountMenu() {
  const { hasPin, lockNow, openPinSetup, removePin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!signOut) return null; // rendered outside AuthGate

  const item = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: `${space[2]} ${space[3]}`,
    background: 'transparent',
    border: 'none',
    fontSize: font.size.sm,
    fontFamily: font.family,
    color: color.ink,
    cursor: 'pointer',
  };
  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm }}
      >
        Account
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: space[1],
            minWidth: 160,
            background: color.paperV6,
            border: `1px solid ${color.borderSubtle}`,
            borderRadius: radius.md,
            boxShadow: elevation.dropdown,
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {hasPin && (
            <button type="button" style={item} onClick={run(lockNow)}>
              Lock now
            </button>
          )}
          <button type="button" style={item} onClick={run(openPinSetup)}>
            {hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
          {hasPin && (
            <button type="button" style={item} onClick={run(removePin)}>
              Remove PIN
            </button>
          )}
          <button type="button" style={{ ...item, color: color.danger }} onClick={run(signOut)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
