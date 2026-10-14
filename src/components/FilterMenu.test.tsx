import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FilterMenu } from './ui';
import { ModalFrame } from './ModalFrame';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test('menu stays inside the viewport at the left edge and focuses the selected option', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({x:18,y:620,left:18,right:140,top:620,bottom:658,width:122,height:38,toJSON:()=>({})});
  render(<FilterMenu label="Mode" value="two" options={[{value:'one',label:'First'},{value:'two',label:'Second'}]} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', {name:'Mode'}));
  const list=screen.getByRole('listbox');
  expect(list.closest('[data-radix-popper-content-wrapper]')).toHaveStyle({position:'fixed'});
  await waitFor(()=>expect(screen.getByRole('option', {name:'Second'})).toHaveFocus());
});
test('keyboard handlers leave unrelated text editing alone and restore trigger focus on selection', async () => {
  const change=vi.fn();
  render(<><input aria-label="Notes" /><FilterMenu label="Mode" value="one" options={[{value:'one',label:'First'},{value:'two',label:'Second'}]} onChange={change}/></>);
  fireEvent.click(screen.getByRole('button',{name:'Mode'}));
  const notes=screen.getByRole('textbox',{hidden:true});notes.focus();
  expect(fireEvent.keyDown(notes,{key:'ArrowDown'})).toBe(true);
  fireEvent.click(screen.getByRole('option',{name:'Second'}));
  expect(change).toHaveBeenCalledWith('two');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Mode'})).toHaveFocus());
});
test('mobile menu fits above fixed navigation and remains in dialog focus scope',()=>{
 const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog);
 const bounds=(left:number,top:number,width:number,height:number)=>({x:left,y:top,left,right:left+width,top,bottom:top+height,width,height,toJSON:()=>({})});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this===dialog ? bounds(12,30,366,700) : bounds(20,600,180,40);});
 render(<FilterMenu label="Settings mode" value="one" options={[{value:'one',label:'First'},{value:'two',label:'Second'}]} onChange={vi.fn()} />,{container:dialog});
 fireEvent.click(screen.getByRole('button',{name:'Settings mode'}));
 expect(dialog.contains(screen.getByRole('listbox'))).toBe(false);
 expect(screen.getByRole('listbox').closest('[data-radix-popper-content-wrapper]')).toHaveStyle({position:'fixed'});
 fireEvent.keyDown(screen.getByRole('option',{name:'First'}),{key:'Escape'});
 expect(screen.queryByRole('listbox')).toBeNull();dialog.remove();
});

test('a small modal does not limit the select popup to its own height',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
   const isDialog=this.getAttribute('role')==='dialog';
   return {x:140,y:300,left:140,right:580,top:300,bottom:isDialog?470:410,width:440,height:isDialog?170:40,toJSON:()=>({})};
 });
 render(<ModalFrame open onClose={()=>{}} title="Replace task"><FilterMenu label="Skill" value="writing" onChange={()=>{}} options={['writing','speaking','reading','listening'].map(value=>({value,label:value}))}/></ModalFrame>);
 fireEvent.click(screen.getByRole('button',{name:'Skill'}));
 const popup=screen.getByRole('listbox');
 expect(popup.closest('[role="dialog"]')).toBeNull();
 expect(popup.closest('[data-radix-popper-content-wrapper]')).toHaveStyle({position:'fixed'});
});
