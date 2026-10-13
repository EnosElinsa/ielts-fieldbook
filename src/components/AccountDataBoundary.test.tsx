import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AccountDataBoundary } from './AccountDataBoundary';
const m = vi.hoisted(() => ({status:'unloaded', load:vi.fn(),bank:vi.fn()}));
vi.mock('../context/FieldbookContext',()=>({useFieldbook:()=>({moduleStatus:{productive:m.status},bankStatus:{},ensureAccountModule:m.load,ensureQuestionBank:m.bank})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
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
