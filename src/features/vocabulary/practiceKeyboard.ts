import type { KeyboardEvent } from 'react';

export function practiceKeyboard(event: KeyboardEvent<HTMLElement>, actions: {
  index: number; count: number; pageStart: number; autoAdvance: boolean;
  move: (index: number) => void; finalize: (index: number) => void;
  play: () => void; pause: () => void;
}) {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.closest('[role="dialog"], [role="listbox"], [role="menu"], .filter-menu') ||
      document.querySelector('[role="dialog"], .filter-menu.is-open, [role="menu"][data-state="open"]')) return;
  const input = target instanceof HTMLInputElement && target.type === 'text';
  const editing = input || target instanceof HTMLTextAreaElement || target.isContentEditable;
  const modifier = event.ctrlKey || event.metaKey;
  const perform = (action: () => void) => { event.preventDefault(); event.stopPropagation(); action(); };
  if (event.key === 'Escape') return perform(actions.pause);
  if (modifier) {
    if (event.key === 'Enter') perform(actions.play);
    return;
  }
  if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && !input)) return;
  if (editing && !input) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    perform(() => actions.move(Math.max(0, Math.min(actions.count - 1, actions.index + (event.key === 'ArrowDown' ? 1 : -1)))));
  } else if (event.key === 'Enter' && !event.shiftKey && input) {
    perform(() => { actions.finalize(actions.index); if (actions.autoAdvance && actions.index < actions.count - 1) actions.move(actions.index + 1); });
  } else if (!editing && (event.key.toLowerCase() === 'r' || (event.key === ' ' && !target.closest('button')))) {
    perform(actions.play);
  } else if (!editing && /^[1-9]$/.test(event.key)) {
    const index = actions.pageStart + Number(event.key) - 1;
    if (index < actions.count) perform(() => actions.move(index));
  } else if (!editing && event.key === 'Enter' && !target.closest('button, a, select')) {
    perform(() => actions.move(actions.index));
  }
}
