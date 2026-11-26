import type { ReactNode } from 'react';
import { ModalFrame } from './ModalFrame';
import { StandaloneErrorBoundary, type ErrorBoundaryProps } from './StandaloneErrorBoundary';

type Props = Omit<ErrorBoundaryProps, 'wrapDialog'>;

function wrapDialog(failure: ReactNode, onDismiss: () => void) {
  return <ModalFrame open title="This dialog could not open" header="Workspace" onClose={onDismiss}>{failure}</ModalFrame>;
}

export function PageErrorBoundary(props: Props) {
  return <StandaloneErrorBoundary {...props} wrapDialog={wrapDialog} />;
}
