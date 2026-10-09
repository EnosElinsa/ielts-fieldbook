import { useRef, useState } from 'react';

export function useDraftHistory<T>(initialValue: T) {
  const history = useRef({ values: [initialValue], index: 0 });
  const [, redraw] = useState(0);
  const reset = (value: T) => {
    history.current = { values: [value], index: 0 };
    redraw((n) => n + 1);
  };
  const push = (value: T) => {
    const current = history.current;
    const values = [...current.values.slice(0, current.index + 1), value].slice(-100);
    history.current = { values, index: values.length - 1 };
    redraw((n) => n + 1);
  };
  const move = (direction: number): T | null => {
    const current = history.current;
    const index = current.index + direction;
    if (index < 0 || index >= current.values.length) return null;
    current.index = index;
    redraw((n) => n + 1);
    return current.values[index];
  };
  return {
    push, reset,
    undo: () => move(-1),
    redo: () => move(1),
    canUndo: history.current.index > 0,
    canRedo: history.current.index < history.current.values.length - 1,
  };
}
