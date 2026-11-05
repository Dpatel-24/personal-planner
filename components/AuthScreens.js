// AuthScreens — the full-screen pieces AuthGate shows instead of the app:
// email/password login, the 4-digit PIN pad, the lock screen and first-time
// PIN setup. Presentational + the few calls they own; session/lock state
// lives in AuthGate.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { markSignedIn, readSignOutNote, clearSignOutNote } from '@/lib/pinLock';
import { color, space, radius, font } from '@/lib/tokens';
import { input as inputStyle, buttonPrimary, buttonGhost } from '@/lib/components';

const screenStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: color.paperV6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space[4],
  overflowY: 'auto',
};

const cardStyle = {
  width: '100%',
  maxWidth: 340,
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
};

const titleStyle = { fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.ink, fontFamily: font.family };
const subtitleStyle = { fontSize: font.size.sm, color: color.mutedText, fontFamily: font.family };
const errorStyle = { fontSize: font.size.sm, color: color.danger, fontFamily: font.family };

const SIGN_OUT_REASONS = {
  manual: 'you signed out',
  too_many_wrong_pins: 'too many wrong PINs',
  session_too_old: 'session reached its 1-year limit',
  session_ended_unexpectedly: 'the session ended on its own',
};

export function ScreenShell({ children }) {
  return (
    <div style={screenStyle}>
      <div style={cardStyle}>{children}</div>
    </div>
  );
}

export function LoginScreen() {
  // Account creation is only offered at /?signup=1, so the public login page
  // doesn't advertise it. The database is locked to one user id regardless,
  // so an extra sign-up would get no data — this just keeps the surface small.
  const [allowSignup, setAllowSignup] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [lastSignOut, setLastSignOut] = useState(null);

  useEffect(() => {
    setAllowSignup(new URLSearchParams(window.location.search).get('signup') === '1');
    setLastSignOut(readSignOutNote());
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.session) {
          markSignedIn();
          clearSignOutNote();
        } else setNotice('Check your email to confirm the account, then sign in here.');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        markSignedIn();
        clearSignOutNote();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <div style={titleStyle}>OS</div>
      <div style={subtitleStyle}>{mode === 'signup' ? 'Create your account' : 'Sign in to continue'}</div>
      {lastSignOut && (
        <div style={{ ...subtitleStyle, fontSize: font.size.xs }}>
          Signed out ({SIGN_OUT_REASONS[lastSignOut.reason] ?? lastSignOut.reason}) at{' '}
          {new Date(lastSignOut.at).toLocaleTimeString()}.
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <input
          type="email"
          name="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          name="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'signup' ? 8 : undefined}
          style={inputStyle}
        />
        {error && <div style={errorStyle}>{error}</div>}
        {notice && <div style={subtitleStyle}>{notice}</div>}
        <button type="submit" disabled={busy} style={{ ...buttonPrimary, width: '100%', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {allowSignup && (
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setError(null);
            setNotice(null);
          }}
          style={{ ...buttonGhost, border: 'none', fontSize: font.size.sm }}
        >
          {mode === 'signup' ? 'I already have an account' : 'Create account'}
        </button>
      )}
    </ScreenShell>
  );
}

// 4-dot entry + number pad. Also accepts the keyboard. `onComplete(pin)` may
// be async; the pad clears itself afterwards so a wrong PIN can be retried.
export function PinPad({ title, subtitle, error, onComplete, footer }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const press = useCallback(
    async (digit) => {
      if (busy) return;
      const next = (pin + digit).slice(0, 4);
      setPin(next);
      if (next.length === 4) {
        setBusy(true);
        try {
          await onComplete(next);
        } finally {
          setPin('');
          setBusy(false);
        }
      }
    },
    [busy, pin, onComplete]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const keyStyle = {
    height: 56,
    borderRadius: radius.full,
    border: `1px solid ${color.borderSubtle}`,
    background: color.white,
    color: color.ink,
    fontSize: font.size.xl,
    fontFamily: font.family,
    cursor: 'pointer',
  };

  return (
    <>
      <div style={{ ...titleStyle, textAlign: 'center' }}>{title}</div>
      {subtitle && <div style={{ ...subtitleStyle, textAlign: 'center' }}>{subtitle}</div>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: space[3], margin: `${space[3]} 0` }} aria-label="PIN entry">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: radius.full,
              border: `2px solid ${color.navy}`,
              background: i < pin.length ? color.navy : 'transparent',
            }}
          />
        ))}
      </div>
      {error && <div style={{ ...errorStyle, textAlign: 'center' }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[3] }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" style={keyStyle} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" style={keyStyle} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          style={{ ...keyStyle, border: 'none', background: 'transparent', fontSize: font.size.md }}
          onClick={() => setPin((p) => p.slice(0, -1))}
          aria-label="Delete"
        >
          ⌫
        </button>
      </div>
      {footer}
    </>
  );
}

export function LockScreen({ onVerify }) {
  const [error, setError] = useState(null);
  return (
    <ScreenShell>
      <PinPad
        title="Enter PIN"
        error={error}
        onComplete={async (pin) => {
          const result = await onVerify(pin);
          setError(result.ok ? null : `Wrong PIN. ${result.remaining} ${result.remaining === 1 ? 'try' : 'tries'} left.`);
        }}
      />
    </ScreenShell>
  );
}

// Two-step: enter a PIN, then enter it again to confirm.
export function PinSetupScreen({ onSave, onSkip }) {
  const [first, setFirst] = useState(null);
  const [error, setError] = useState(null);
  return (
    <ScreenShell>
      <PinPad
        key={first ? 'confirm' : 'enter'}
        title={first ? 'Confirm PIN' : 'Set a 4-digit PIN'}
        subtitle={first ? null : 'Unlock this device quickly instead of typing your password.'}
        error={error}
        onComplete={async (pin) => {
          if (!first) {
            setFirst(pin);
            setError(null);
          } else if (pin === first) {
            await onSave(pin);
          } else {
            setFirst(null);
            setError("PINs didn't match. Start again.");
          }
        }}
        footer={
          <button type="button" onClick={onSkip} style={{ ...buttonGhost, border: 'none', fontSize: font.size.sm }}>
            Skip for now
          </button>
        }
      />
    </ScreenShell>
  );
}
