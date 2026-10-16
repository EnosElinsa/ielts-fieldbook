import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PageTransition } from './PageTransition';

const animate = vi.fn();
const cancel = vi.fn();
let reduce = false;
beforeEach(() => {
  reduce = false;
  animate.mockReset().mockReturnValue({ cancel, finished: Promise.resolve() });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Element.prototype.animate = animate;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).animate; });

test('animates a destination without remounting its form when the transition key changes', () => {
  const view = render(<PageTransition transitionKey="target"><section className="view active"><input aria-label="Draft" defaultValue="Unsaved" /></section></PageTransition>);
  const input = screen.getByLabelText('Draft');
  expect(animate).toHaveBeenCalledOnce();
  view.rerender(<PageTransition transitionKey="schedule"><section className="view active"><input aria-label="Draft" defaultValue="Unsaved" /></section></PageTransition>);
  expect(screen.getByLabelText('Draft')).toBe(input);
  expect(animate).toHaveBeenCalledTimes(2);
});

test('waits for lazy page content and does not animate every ordinary rerender', async () => {
  const view = render(<PageTransition transitionKey="reading"><div className="async-loading-page">Loading</div></PageTransition>);
  expect(animate).not.toHaveBeenCalled();
  await act(async () => { view.rerender(<PageTransition transitionKey="reading"><section className="view active">Ready</section></PageTransition>); });
  expect(animate).toHaveBeenCalledOnce();
  view.rerender(<PageTransition transitionKey="reading"><section className="view active">Answer changed</section></PageTransition>);
  expect(animate).toHaveBeenCalledOnce();
});

test('respects reduced motion and still renders the destination', () => {
  reduce = true;
  render(<PageTransition transitionKey="reading"><section className="view active">Reading</section></PageTransition>);
  expect(screen.getByText('Reading')).toBeVisible();
  expect(animate).not.toHaveBeenCalled();
});

test('waits when a mounted route is still showing its full-page skeleton', async () => {
  const view = render(<PageTransition transitionKey="reading"><section className="view active"><div className="async-loading-page">Loading source material</div></section></PageTransition>);
  expect(animate).not.toHaveBeenCalled();
  await act(async () => { view.rerender(<PageTransition transitionKey="reading"><section className="view active">Reading passage</section></PageTransition>); });
  expect(animate).toHaveBeenCalledOnce();
});
