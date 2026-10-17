import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {VocabularyMeaningDiagram} from './VocabularyMeaningDiagram';
afterEach(cleanup);
const draw=(kind:string)=>render(<VocabularyMeaningDiagram diagram={{kind,term:kind.split('-')[0],entryId:'entry',senseId:'sense',definition:'An exact meaning.',pos:'noun'}} />);

test('compaction retains six equally sized particles on each side',()=>{
 const {container}=draw('impact-compaction');
 expect(screen.getByRole('img')).toHaveAccessibleName(/same six particles/);
 const particles=[...container.querySelectorAll('circle')];
 expect(particles).toHaveLength(12);
 expect(new Set(particles.map(node=>node.getAttribute('r')))).toEqual(new Set(['14']));
 expect(particles.filter(node=>Number(node.getAttribute('cx'))<260)).toHaveLength(6);
 expect(particles.filter(node=>Number(node.getAttribute('cx'))>260)).toHaveLength(6);
});

test('electrostatic induction places negative charge nearer the positive rod and preserves net zero',()=>{
 const {container}=draw('influence-induction');
 expect(screen.getByRole('img')).toHaveAccessibleName(/isolated neutral conductor/);
 expect([...container.querySelectorAll('text[x="235"]')].map(node=>node.textContent)).toEqual(['−','−','−']);
 expect([...container.querySelectorAll('text[x="415"]')].map(node=>node.textContent)).toEqual(['+','+','+']);
 expect(screen.getByText('Isolated conductor · net 0')).toBeInTheDocument();
 expect(screen.getByText(/Grounding or contact would change the setup/)).toBeInTheDocument();
});

test('the probability diagram contains six distinct outcomes and keeps the even event separate',()=>{
 draw('outcome-probability');
 expect(screen.getByRole('img')).toHaveAccessibleName(/six upper-face results/);
 for(const n of ['1','2','3','4','5','6'])expect(screen.getByText(n,{exact:true})).toBeInTheDocument();
 expect(screen.getByText('3 = one outcome')).toBeInTheDocument();
 expect(screen.getByText('Even event = {2, 4, 6}')).toBeInTheDocument();
 expect(screen.getByText(/does not establish that they are equally likely/)).toBeInTheDocument();
});

test('a learning outcome remains an intended ability awaiting assessed achievement',()=>{
 draw('outcome-learning');
 expect(screen.getByRole('img')).toHaveAccessibleName(/intended ability.*awaiting assessment evidence/);
 expect(screen.getByText('Goal ≠ demonstrated success')).toBeInTheDocument();
 expect(screen.getByText(/Assessment evidence is needed/)).toBeInTheDocument();
});
