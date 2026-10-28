import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import WorkspaceNavDrawer from './WorkspaceNavDrawer';

const WorkspaceNavDrawerContext = createContext(null);

export function WorkspaceNavDrawerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  const value = useMemo(
    () => ({ open, setOpen, close, toggle }),
    [open, close, toggle],
  );

  return (
    <WorkspaceNavDrawerContext.Provider value={value}>
      {children}
      <WorkspaceNavDrawer />
    </WorkspaceNavDrawerContext.Provider>
  );
}

export function useWorkspaceNavDrawer() {
  const ctx = useContext(WorkspaceNavDrawerContext);
  if (!ctx) {
    throw new Error('useWorkspaceNavDrawer must be used within WorkspaceNavDrawerProvider');
  }
  return ctx;
}
