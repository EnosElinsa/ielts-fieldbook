import * as Tooltip from '@radix-ui/react-tooltip';
import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';

const TooltipProviderPresent = createContext(false);

export function TooltipProvider({ delayDuration = 350, children }: { delayDuration?: number; children: ReactNode }) {
  const present = useContext(TooltipProviderPresent);
  if (present) return <>{children}</>;
  return (
    <TooltipProviderPresent.Provider value={true}>
      <Tooltip.Provider delayDuration={delayDuration}>{children}</Tooltip.Provider>
    </TooltipProviderPresent.Provider>
  );
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  const hasProvider = useContext(TooltipProviderPresent);
  const content = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} className={`icon-button ${className}`} {...props}>{children}</button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={6}>{label}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
  return hasProvider ? content : <TooltipProvider delayDuration={350}>{content}</TooltipProvider>;
}
