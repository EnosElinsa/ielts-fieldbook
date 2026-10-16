import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { PageErrorBoundary } from './PageErrorBoundary';
import { installPageLoadRecovery } from '../lib/pageLoadRecovery';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('a failed page can retry without replacing the surrounding workspace', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  function Page() { if (fail) throw new Error('Broken page'); return <p>Recovered page</p>; }
  render(<MemoryRouter><p>Workspace navigation</p><PageErrorBoundary resetKey="one"><Page /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('This page could not open');
  expect(screen.getByText('Workspace navigation')).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Recovered page')).toBeInTheDocument();
});

test('navigation resets page failures and failed imports offer a page reload', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailedImport(): never { throw new TypeError('Failed to fetch dynamically imported module: /assets/page.js'); }
  const view = render(<MemoryRouter><PageErrorBoundary resetKey="one"><FailedImport /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  view.rerender(<MemoryRouter><PageErrorBoundary resetKey="two"><p>Other page</p></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByText('Other page')).toBeInTheDocument();
});

test('a failed page stylesheet requires a reload and offers a fresh document as its fallback', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailedStyle(): never { throw new Error('Unable to preload CSS for /assets/page.css'); }
  function Route() { return <output aria-label="Current route">{useLocation().pathname}</output>; }
  render(<MemoryRouter><Route /><PageErrorBoundary><FailedStyle /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Return to Today' })).toHaveAttribute('href', '/today');
  // Stop jsdom's document navigation after React's event handler has run.
  document.addEventListener('click', event => event.preventDefault(), { once: true });
  fireEvent.click(screen.getByRole('link', { name: 'Return to Today' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
});

test('offline page failures explain reconnection and enable recovery when the connection returns', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  function FailedImport(): never { throw new TypeError('Failed to fetch dynamically imported module: /assets/page.js'); }
  render(<MemoryRouter><PageErrorBoundary><FailedImport /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent(/offline/i);
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeDisabled();
  fireEvent(window, new Event('online'));
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled();
  expect(screen.getByRole('alert')).not.toHaveTextContent(/offline/i);
});

test('page failure focuses the recovery panel and groups its actions separately from the message', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailedPage(): never { throw new Error('Broken page'); }
  render(<MemoryRouter><PageErrorBoundary><FailedPage /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveFocus();
  const retry=screen.getByRole('button', {name:'Try again'});
  const back=screen.getByRole('link', {name:'Return to Today'});
  expect(retry.parentElement).toBe(back.parentElement);
  expect(retry.parentElement).not.toContainElement(screen.getByRole('alert'));
});

function preloadFailure(error: Error) {
  const event = new Event('vite:preloadError', { cancelable: true });
  Object.assign(event, { payload: error });
  window.dispatchEvent(event);
  return event;
}

test('a first-load download failure reloads once per build and cannot enter a reload loop', () => {
  sessionStorage.clear();
  const reload = vi.fn();
  let stop = installPageLoadRecovery(reload);
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/page.js');
  try {
    expect(preloadFailure(error).defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
    stop = installPageLoadRecovery(reload);
    expect(preloadFailure(error).defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  } finally { stop(); sessionStorage.clear(); }
});

test.each(['input', 'pointerdown', 'keydown', 'popstate'])(
  'a %s event prevents an automatic reload that could interrupt work', event => {
    sessionStorage.clear();
    const reload = vi.fn();
    const stop = installPageLoadRecovery(reload);
    try {
      window.dispatchEvent(new Event(event));
      expect(preloadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/page.js')).defaultPrevented).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    } finally { stop(); sessionStorage.clear(); }
  },
);

test('offline, blocked browser storage, unrelated errors and changed routes never force a reload', () => {
  sessionStorage.clear();
  const reload = vi.fn();
  let stop = installPageLoadRecovery(reload);
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/page.js');
  try {
    const online=vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(preloadFailure(error).defaultPrevented).toBe(false);
    online.mockRestore();
    expect(preloadFailure(new Error('Invalid study data')).defaultPrevented).toBe(false);
    const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Blocked');});
    expect(preloadFailure(error).defaultPrevented).toBe(false);
    write.mockRestore();
    history.replaceState(null,'','/other-page');
    expect(preloadFailure(error).defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  } finally { stop(); history.replaceState(null,'','/'); sessionStorage.clear(); }
});

test('a later load failure cannot restart an already open workspace', () => {
  sessionStorage.clear();
  const reload = vi.fn();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const stop = installPageLoadRecovery(reload);
  try {
    clock.mockReturnValue(60_000);
    expect(preloadFailure(new Error('Unable to preload CSS for /assets/page.css')).defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  } finally { stop(); clock.mockRestore(); sessionStorage.clear(); }
});

test('a new build can recover after an earlier build used its one recovery attempt', () => {
  sessionStorage.clear();
  const script=document.createElement('script');
  script.type='module'; script.src='/assets/entry-first.js'; document.head.append(script);
  const reload=vi.fn();
  let stop=installPageLoadRecovery(reload);
  try {
    preloadFailure(new Error('Unable to preload CSS for /assets/first.css'));
    stop();
    script.src='/assets/entry-next.js';
    stop=installPageLoadRecovery(reload);
    expect(preloadFailure(new Error('Unable to preload CSS for /assets/next.css')).defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  } finally { stop(); script.remove(); sessionStorage.clear(); }
});

test('a failed dialog remains dismissible without replacing the workspace or its live draft', () => {
  vi.spyOn(console,'error').mockImplementation(()=>{});
  function FailedDialog(): never { throw new TypeError('Failed to fetch dynamically imported module: /assets/dialog.js'); }
  function Workspace() {
    const [open,setOpen]=useState(false);
    const [draft,setDraft]=useState('');
    return <MemoryRouter><textarea aria-label="Draft" value={draft} onChange={event=>setDraft(event.target.value)} />
      <button onClick={()=>setOpen(true)}>Open dialog</button>
      <PageErrorBoundary resetKey={String(open)} onDismiss={()=>setOpen(false)}>{open?<FailedDialog/>:null}</PageErrorBoundary>
    </MemoryRouter>;
  }
  render(<Workspace/>);
  const draft=screen.getByRole('textbox',{name:'Draft'});
  fireEvent.change(draft,{target:{value:'An unfinished answer.'}});
  fireEvent.click(screen.getByRole('button',{name:'Open dialog'}));
  expect(screen.getByRole('dialog',{name:'This dialog could not open'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Keep studying'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox',{name:'Draft'})).toBe(draft);
  expect(draft).toHaveValue('An unfinished answer.');
});
