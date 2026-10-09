import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function ModalFrame({ open, onClose, children, title = 'Fieldbook' }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
          <Dialog.Close className="icon-button dialog-close" aria-label="Close dialog"><X size={18} /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
