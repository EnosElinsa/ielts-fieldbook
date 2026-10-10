import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import '../styles/modal-workbench.css';

export function ModalFrame({ open, onClose, children, title = 'Fieldbook', header, description, footer, size = 'md', busy = false }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: string;
  header?: ReactNode; description?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; busy?: boolean;
}) {
  const structured = header !== undefined || description !== undefined || footer !== undefined;
  const dismiss = () => { if (!busy) onClose(); };
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content modal-workbench modal-workbench-${size} ${structured ? 'modal-workbench-structured' : 'modal-workbench-legacy'}`} {...(!description ? { 'aria-describedby': undefined } : {})} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }} aria-busy={busy}>
          <div className="modal-workbench-shell">
            {structured ? <header className="modal-workbench-header"><div className="modal-workbench-header-copy">{header ? <div className="modal-workbench-eyebrow">{header}</div> : null}<Dialog.Title className="modal-workbench-title">{title}</Dialog.Title>{description ? <Dialog.Description className="modal-workbench-description">{description}</Dialog.Description> : null}</div></header> : <Dialog.Title className="sr-only">{title}</Dialog.Title>}
            <div className="modal-workbench-body">{children}</div>
            {footer ? <footer className="modal-workbench-footer">{footer}</footer> : null}
          </div>
          <Dialog.Close className="icon-button dialog-close" aria-label="Close dialog" disabled={busy}><X size={18} /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
