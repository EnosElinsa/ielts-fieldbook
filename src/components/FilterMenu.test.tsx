import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FilterMenu } from './ui';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test('menu stays inside the viewport at the left edge and focuses the selected option', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({x:18,y:620,left:18,right:140,top:620,bottom:658,width:122,height:38,toJSON:()=>({})});
  render(<FilterMenu label="Mode" value="two" options={[{value:'one',label:'First'},{value:'two',label:'Second'}]} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', {name:'Mode'}));
  const list=screen.getByRole('listbox');
  expect(list.style.position).toBe('fixed');
  expect(parseFloat(list.style.left)).toBeGreaterThanOrEqual(12);
  expect(screen.getByRole('option', {name:'Second'})).toHaveFocus();
});
test('keyboard handlers leave unrelated text editing alone and restore trigger focus on selection', () => {
  const change=vi.fn();
  render(<><input aria-label="Notes" /><FilterMenu label="Mode" value="one" options={[{value:'one',label:'First'},{value:'two',label:'Second'}]} onChange={change}/></>);
  fireEvent.click(screen.getByRole('button',{name:'Mode'}));
  const notes=screen.getByRole('textbox');notes.focus();
  expect(fireEvent.keyDown(notes,{key:'ArrowDown'})).toBe(true);
  fireEvent.click(screen.getByRole('option',{name:'Second'}));
  expect(change).toHaveBeenCalledWith('two');
  expect(screen.getByRole('button',{name:'Mode'})).toHaveFocus();
});
test('mobile menu fits above fixed navigation and remains in dialog focus scope',()=>{
 const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog);
 const bounds=(left:number,top:number,width:number,height:number)=>({x:left,y:top,left,right:left+width,top,bottom:top+height,width,height,toJSON:()=>({})});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this===dialog ? bounds(12,30,366,700) : bounds(20,600,180,40);});
 render(<FilterMenu label="Settings mode" value="one" options={[{value:'one',label:'First'},{value:'two',label:'Second'}]} onChange={vi.fn()} />,{container:dialog});
 fireEvent.click(screen.getByRole('button',{name:'Settings mode'}));
 expect(dialog.contains(screen.getByRole('listbox'))).toBe(true);
 expect(screen.getByRole('listbox').style.position).toBe('absolute');
 fireEvent.keyDown(screen.getByRole('option',{name:'First'}),{key:'Escape'});
 expect(screen.queryByRole('listbox')).toBeNull();dialog.remove();
});
