import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamBankFilters } from './ExamBankFilters';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('mobile filters retain URL values while collapsed, remove individually and open on desktop resize', async()=>{
  let resize!:()=>void;
  let narrow=true;
  const remove=vi.fn();
  vi.stubGlobal('matchMedia',()=>({get matches(){return narrow;},addEventListener:(_:string,callback:()=>void)=>{resize=callback;},removeEventListener:remove}));
  const change=vi.fn();
  const view=render(<ExamBankFilters onChange={change} filters={[{key:'book',label:'Book',value:'8',options:[{value:'all',label:'All books'},{value:'8',label:'Cambridge 8'}]}]}/>);
  const panel=view.container.querySelector('details')!;
  expect(panel.open).toBe(false);
  expect(screen.getByRole('combobox',{name:'Book'})).not.toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'Remove Book filter: Cambridge 8'}));
  expect(change).toHaveBeenCalledWith('book','all');
  fireEvent.click(panel.querySelector('summary')!);
  expect(await screen.findByRole('combobox',{name:'Book'})).toHaveTextContent('Cambridge 8');
  narrow=false;act(()=>resize());
  expect(panel.open).toBe(true);
  view.unmount();expect(remove).toHaveBeenCalled();
});
