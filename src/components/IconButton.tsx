import * as Tooltip from '@radix-ui/react-tooltip';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={350}><Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} className={`icon-button ${className}`} {...props}>{children}</button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={6}>{label}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root></Tooltip.Provider>
  );
}
