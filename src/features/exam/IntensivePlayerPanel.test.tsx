import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { IntensivePlayerPanel } from './IntensivePlayerPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('navigation offset follows player size, expanded settings and viewport changes', () => {
  let measure!: () => void;
  let height = 210;
  let position = 'sticky';
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { measure = callback; } observe() {} disconnect = disconnect; });
  vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ position }) as CSSStyleDeclaration);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
  const view = render(<div><IntensivePlayerPanel><details><summary>Settings</summary>Controls</details></IntensivePlayerPanel></div>);
  const main = view.container.firstElementChild as HTMLElement;
  expect(main.style.getPropertyValue('--intensive-player-offset')).toBe('226px');
  height = 250;
  act(() => measure());
  expect(main.style.getPropertyValue('--intensive-player-offset')).toBe('266px');
  position = 'static';
  fireEvent(view.container.querySelector('details')!, new Event('toggle'));
  expect(main.style.getPropertyValue('--intensive-player-offset')).toBe('16px');
  position = 'sticky';
  fireEvent(window, new Event('resize'));
  expect(main.style.getPropertyValue('--intensive-player-offset')).toBe('266px');
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
