import { useContext } from 'react';
import { WorkspaceNavDrawerContext } from './workspaceNavDrawerContext.js';

export function useWorkspaceNavDrawer() {
  const ctx = useContext(WorkspaceNavDrawerContext);
  if (!ctx) {
    throw new Error('useWorkspaceNavDrawer must be used within WorkspaceNavDrawerProvider');
  }
  return ctx;
}
