import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyGroupPicker } from './VocabularyGroupPicker';
vi.mock('../../domain/vocabulary/catalog',()=>({VOCABULARY_CATALOG:{books:[{id:'b',title:'Book'}],units:[{id:'c1',bookId:'b',title:'First',kind:'chapter'},{id:'c2',bookId:'b',title:'Second',kind:'chapter'},{id:'g1',bookId:'b',parentId:'c1',title:'River',kind:'group'},{id:'g2',bookId:'b',parentId:'c2',title:'Mountain',kind:'group'}],memberships:[{bookId:'b',unitId:'g1',entryId:'one'},{bookId:'b',unitId:'g2',entryId:'two'}]}}));
vi.mock('../../domain/vocabulary/selection',()=>({buildUnitPracticeQueue:()=>({eligibleWords:1})}));
afterEach(cleanup);
Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','');}});
test('search crosses the current chapter and exposes mobile results',()=>{
render(<VocabularyGroupPicker state={{}} bookId='b' currentUnitId='g1' onSelect={vi.fn()} onClose={vi.fn()}/>);
fireEvent.change(screen.getByRole('textbox'),{target:{value:'Mountain'}});
expect(screen.getByRole('button',{name:/Mountain/})).toBeInTheDocument();
expect(document.querySelector('.vocabulary-picker-columns')).toHaveClass('has-chapter');
fireEvent.click(screen.getByRole('button',{name:'All chapters'}));expect(screen.getByRole('button',{name:'All chapters'})).toHaveAttribute('aria-pressed','true');
});
