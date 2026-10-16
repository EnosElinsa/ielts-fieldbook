import { createContext, type RefObject } from 'react';

// A ref lets lazy pages check the layout effect's decision without rerendering the shell.
export type WorkspaceScrollState = { key: string; restored: boolean; restoreAfterLayout?: () => void };
export const WorkspaceScrollRestoration = createContext<RefObject<WorkspaceScrollState> | null>(null);
