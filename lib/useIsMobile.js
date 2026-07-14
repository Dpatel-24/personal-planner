// useIsMobile — shared breakpoint hook so pages/index.js and WeekBoardView.js
// agree on the same definition of "mobile" (one place, not two magic numbers).
// Defaults to false on first render (desktop layout) since window isn't
// available during SSR; corrects itself via useEffect right after mount.
import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = '(max-width: 768px)';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}
