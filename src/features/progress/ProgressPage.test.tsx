import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ProgressPage } from './ProgressPage';
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({activeSkill:'writing',state:{sessions:[],assessments:[],plans:[],settings:{}}})}));
vi.mock('../vocabulary/VocabularyPages',()=>({VocabularyProgressPage:()=> <div>Vocabulary evidence panel</div>}));
function Location(){return <output>{useLocation().search}</output>}
test('legacy vocabulary category opens vocabulary and selector persists category',()=>{
render(<MemoryRouter initialEntries={['/progress?category=vocabulary']}><ProgressPage/><Location/></MemoryRouter>);
expect(screen.getByText('Vocabulary evidence panel')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button',{name:'Progress skill'}));fireEvent.click(screen.getByRole('option',{name:'Speaking'}));
expect(screen.getByText('?category=speaking')).toBeInTheDocument();
});
