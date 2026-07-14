// TimerContext — single source of truth for the currently-active timer
// (CLAUDE.md: timer is one GLOBAL state, not per-task). Provided at the app
// shell level (pages/index.js), above both the Board/Calendar views and the
// persistent TimerBar, so a card's start button and the bar always agree on
// what's running without each polling the DB independently.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getActiveTimer } from '@/lib/timer-queries';

const TimerContext = createContext({ activeTimer: null, refreshTimer: () => {} });

export function TimerProvider({ children }) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [version, setVersion] = useState(0);
  const refreshTimer = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    getActiveTimer()
      .then((timer) => {
        if (!cancelled) setActiveTimer(timer);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <TimerContext.Provider value={{ activeTimer, refreshTimer }}>{children}</TimerContext.Provider>
  );
}

export function useTimer() {
  return useContext(TimerContext);
}
