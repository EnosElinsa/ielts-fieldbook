import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AccountDataBoundary } from './AccountDataBoundary';
const m = vi.hoisted(() => ({status:'unloaded', booted:undefined as boolean | undefined,load:vi.fn(),bank:vi.fn()}));
vi.mock('../context/FieldbookContext',()=>({useFieldbook:()=>({booted:m.booted,moduleStatus:{productive:m.status,vocabulary:m.status},bankStatus:{},ensureAccountModule:m.load,ensureQuestionBank:m.bank})}));
afterEach(()=>{cleanup();vi.resetAllMocks();m.status='unloaded';m.booted=undefined;});

test('cached ready modules cannot start preparation until account initialization establishes its epoch',async()=>{
  m.status='ready';m.booted=false;m.load.mockResolvedValue(undefined);
  const view=render(<AccountDataBoundary modules={['vocabulary']}><p>Prepared account</p></AccountDataBoundary>);
  expect(m.load).not.toHaveBeenCalled();
  expect(screen.queryByText('Prepared account')).toBeNull();
  m.booted=true;view.rerender(<AccountDataBoundary modules={['vocabulary']}><p>Prepared account</p></AccountDataBoundary>);
  await act(async()=>{await Promise.resolve();});
  expect(m.load).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Prepared account')).toBeTruthy();
});
test('a missing module blocks dependent content while navigation outside the boundary stays usable', async()=>{
  let finish:()=>void=()=>{};
  m.load.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const view=render(<><button>Account</button><AccountDataBoundary modules={['productive']}><p>Complete history</p></AccountDataBoundary></>);
  expect(screen.queryByText('Complete history')).toBeNull();
  expect(screen.getByRole('button',{name:'Account'})).toBeTruthy();
  expect(m.bank).not.toHaveBeenCalled();
  await act(async()=>{m.status='ready';finish();});
  view.rerender(<><button>Account</button><AccountDataBoundary modules={['productive']}><p>Complete history</p></AccountDataBoundary></>);
  expect(screen.getByText('Complete history')).toBeTruthy();
});

test('a ready vocabulary module still waits for the current word scope, and a different word cannot reuse its completion', async()=>{
  m.status='ready';
  const finishes: (()=>void)[]=[];
  m.load.mockImplementation(()=>new Promise<void>(resolve=>{finishes.push(resolve);}));
  const view=render(<AccountDataBoundary modules={['vocabulary']} vocabularyEntryIds={['word-a']}><p>Prepared word</p></AccountDataBoundary>);
  expect(screen.queryByText('Prepared word')).toBeNull();
  expect(m.load).toHaveBeenCalledWith('vocabulary',{entryIds:['word-a']});
  await act(async()=>{finishes[0]();});
  expect(screen.getByText('Prepared word')).toBeTruthy();
  view.rerender(<AccountDataBoundary modules={['vocabulary']} vocabularyEntryIds={['word-b']}><p>Prepared word</p></AccountDataBoundary>);
  expect(screen.queryByText('Prepared word')).toBeNull();
  expect(m.load).toHaveBeenLastCalledWith('vocabulary',{entryIds:['word-b']});
  await act(async()=>{finishes[1]();});
  expect(screen.getByText('Prepared word')).toBeTruthy();
});

test('leaving one prepared word for all words waits for complete teaching instead of trusting the module-ready flag',async()=>{
  m.status='ready';m.load.mockResolvedValueOnce(undefined);
  const view=render(<AccountDataBoundary modules={['vocabulary']} vocabularyEntryIds={['word-a']}><p>Prepared words</p></AccountDataBoundary>);
  await act(async()=>{await Promise.resolve();});
  expect(screen.getByText('Prepared words')).toBeTruthy();
  let finish=()=>{};
  m.load.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  view.rerender(<AccountDataBoundary modules={['vocabulary']}><p>Prepared words</p></AccountDataBoundary>);
  expect(screen.queryByText('Prepared words')).toBeNull();
  expect(m.load).toHaveBeenLastCalledWith('vocabulary');
  await act(async()=>{finish();});
  expect(screen.getByText('Prepared words')).toBeTruthy();
});

test('late completion of a previous word cannot unlock the current word',async()=>{
  m.status='ready';const finishes: (()=>void)[]=[];
  m.load.mockImplementation(()=>new Promise<void>(resolve=>{finishes.push(resolve);}));
  const view=render(<AccountDataBoundary modules={['vocabulary']} vocabularyEntryIds={['word-a']}><p>Current word</p></AccountDataBoundary>);
  view.rerender(<AccountDataBoundary modules={['vocabulary']} vocabularyEntryIds={['word-b']}><p>Current word</p></AccountDataBoundary>);
  await act(async()=>{finishes[0]();});
  expect(screen.queryByText('Current word')).toBeNull();
  await act(async()=>{finishes[1]();});
  expect(screen.getByText('Current word')).toBeTruthy();
});

test('a failed word scope retries its own teaching and can render after success',async()=>{
  m.status='ready';m.load.mockRejectedValueOnce(new Error('Word teaching unavailable')).mockResolvedValueOnce(undefined);
  render(<AccountDataBoundary modules={['vocabulary']} vocabularyEntryIds={['word-a']}><p>Current word</p></AccountDataBoundary>);
  await act(async()=>{await Promise.resolve();});
  expect(screen.getByText('Word teaching unavailable')).toBeTruthy();
  await act(async()=>{screen.getByRole('button',{name:/retry/i}).click();});
  expect(screen.getByText('Current word')).toBeTruthy();
  expect(m.load).toHaveBeenCalledTimes(2);
  expect(m.load).toHaveBeenLastCalledWith('vocabulary',{entryIds:['word-a']});
});
