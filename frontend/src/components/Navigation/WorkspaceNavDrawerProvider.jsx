import { useCallback, useMemo, useState } from 'react';
import WorkspaceNavDrawer from './WorkspaceNavDrawer';
import { WorkspaceNavDrawerContext } from './workspaceNavDrawerContext.js';

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
