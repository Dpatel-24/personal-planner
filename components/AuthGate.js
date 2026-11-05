// AuthGate — wraps every page (pages/_app.js). Nothing under it mounts, and
// so nothing queries Supabase, until there is a valid session:
//   no session            -> LoginScreen
//   session, PIN stale    -> LockScreen overlay (page stays mounted behind it
//                            so no unsaved state is lost)
//   session, no PIN yet   -> one-time PinSetupScreen (skippable)
// The session itself is Supabase's own (stored on the device, auto-refreshed),
// capped at SESSION_MAX_MS from the last real login — after that, full login.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  hasPin,
  setPin,
  clearPin,
  verifyPin,
  touchActive,
  shouldLock,
  pinPromptSkipped,
  markPinPromptSkipped,
  hasSignedInAt,
  markSignedIn,
  signedInTooLong,
  clearDeviceState,
  MAX_PIN_FAILS,
} from '@/lib/pinLock';
import { LoginScreen, LockScreen, PinSetupScreen } from './AuthScreens';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [locked, setLocked] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [pinVersion, setPinVersion] = useState(0); // bumps so hasPin() re-reads after changes
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  const signOut = useCallback(async () => {
    clearDeviceState();
    setLocked(false);
    setSettingPin(false);
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const s = data.session;
      if (s && signedInTooLong()) {
        signOut();
        setSession(null);
        return;
      }
      if (s && !hasSignedInAt()) markSignedIn(); // session restored from before this feature existed
      setSession(s ?? null);
      if (s) {
        setLocked(shouldLock());
        if (!hasPin() && !pinPromptSkipped()) setSettingPin(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null);
      if (event === 'SIGNED_IN' && s && !hasPin() && !pinPromptSkipped()) setSettingPin(true);
      if (event === 'SIGNED_OUT') clearDeviceState();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [signOut]);

  // Idle/away detection: any interaction keeps the device unlocked; returning
  // after LOCK_AFTER_MS (or an idle tab past it) brings up the PIN screen.
  useEffect(() => {
    if (!session) return undefined;
    const check = () => {
      if (lockedRef.current) return;
      if (shouldLock()) setLocked(true);
      else touchActive();
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    window.addEventListener('pointerdown', check);
    window.addEventListener('keydown', check);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (!lockedRef.current && shouldLock()) setLocked(true);
    }, 30000);
    return () => {
      window.removeEventListener('pointerdown', check);
      window.removeEventListener('keydown', check);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [session]);

  const verify = useCallback(
    async (pin) => {
      const result = await verifyPin(pin);
      if (result.ok) {
        touchActive();
        setLocked(false);
      } else if (result.remaining <= 0) {
        await signOut();
      }
      return result;
    },
    [signOut]
  );

  const api = useMemo(
    () => ({
      hasPin: hasPin(),
      lockNow: () => hasPin() && setLocked(true),
      openPinSetup: () => setSettingPin(true),
      removePin: () => {
        clearPin();
        setPinVersion((v) => v + 1);
      },
      signOut,
    }),
    // pinVersion/settingPin/locked changes can alter hasPin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signOut, pinVersion, settingPin, locked]
  );

  if (session === undefined) return null;
  if (!session) return <LoginScreen />;

  return (
    <AuthContext.Provider value={api}>
      {children}
      {settingPin && (
        <PinSetupScreen
          onSave={async (pin) => {
            await setPin(pin);
            setSettingPin(false);
            setPinVersion((v) => v + 1);
          }}
          onSkip={() => {
            markPinPromptSkipped();
            setSettingPin(false);
          }}
        />
      )}
      {locked && !settingPin && <LockScreen onVerify={verify} onSignOut={signOut} />}
    </AuthContext.Provider>
  );
}

export { MAX_PIN_FAILS };
