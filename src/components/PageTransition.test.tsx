import { cleanup, render, screen, act, waitFor } from '@testing-library/react';
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

test('focuses the resolved route heading even with reduced motion', async () => {
  reduce = true;
  const view = render(<PageTransition transitionKey="reading"><div className="async-loading-page">Loading</div></PageTransition>);
  view.rerender(<PageTransition transitionKey="reading"><section className="view active"><h1>Reading</h1><input aria-label="Filter" value="" readOnly /></section></PageTransition>);
  await waitFor(() => expect(screen.getByRole('heading')).toHaveFocus());
  screen.getByLabelText('Filter').focus();
  view.rerender(<PageTransition transitionKey="reading"><section className="view active"><h1>Reading</h1><input aria-label="Filter" value="query" readOnly /></section></PageTransition>);
  expect(screen.getByLabelText('Filter')).toHaveFocus();
});

test.each(['restored', 'anchor', 'dialog', 'task'])('preserves %s focus and scroll destinations', async kind => {
  const restoration = { current: { key: 'entry', restored: kind === 'restored' } };
  render(<><button autoFocus>Previous focus</button>{kind === 'dialog' && <div role="dialog" aria-modal="true">Dialog</div>}
    <PageTransition transitionKey="planning" scrollRestoration={restoration} skipHeadingFocus={kind === 'anchor'}><section className="view active"><h1>Planning</h1>{kind === 'task' && <button autoFocus>Exact task</button>}</section></PageTransition></>);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(screen.getByRole('heading')).not.toHaveFocus();
  if (kind === 'task') expect(screen.getByRole('button', { name: 'Exact task' })).toHaveFocus();
});
