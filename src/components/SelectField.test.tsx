import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SelectField } from './SelectField';
afterEach(cleanup);
const options=[{value:'one',label:'First'},{value:'two',label:'Second'}];

test('keyboard selection and Escape return focus to the trigger',async()=>{
  const user=userEvent.setup();const change=vi.fn();
  render(<SelectField aria-label="Practice" defaultValue="one" options={options} onValueChange={change}/>);
  const trigger=screen.getByRole('combobox',{name:'Practice'});trigger.focus();
  await user.keyboard('{ArrowDown}');
  await waitFor(()=>expect(screen.getByRole('option',{name:'First'})).toHaveFocus());
  await user.keyboard('{ArrowDown}{Enter}');
  expect(change).toHaveBeenCalledWith('two');
  await waitFor(()=>expect(trigger).toHaveFocus());
  await user.keyboard('{Enter}');expect(screen.getByRole('listbox')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('pointer outside closes the popup without changing the selection',async()=>{
  const change=vi.fn();
  render(<><div data-testid="outside">Outside</div><SelectField aria-label="Practice" value="one" options={options} onValueChange={change}/></>);
  fireEvent.click(screen.getByRole('combobox',{name:'Practice'}));
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  // DismissableLayer starts listening after the opening pointer event.
  await new Promise(resolve=>setTimeout(resolve,0));
  fireEvent.pointerDown(screen.getByTestId('outside'),{pointerType:'mouse'});
  await waitFor(()=>expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();
});
