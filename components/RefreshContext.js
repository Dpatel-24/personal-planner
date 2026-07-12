// RefreshContext — a single version counter that all views subscribe to so a
// mutation in any view (or the sidebar) refreshes the others. Each view puts
// `version` in its fetch deps and calls `refresh()` after it writes.
import { createContext, useContext, useState, useCallback } from 'react';

const RefreshContext = createContext({ version: 0, refresh: () => {} });

export function RefreshProvider({ children }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <RefreshContext.Provider value={{ version, refresh }}>{children}</RefreshContext.Provider>
  );
}

export function useRefresh() {
  return useContext(RefreshContext);
}
