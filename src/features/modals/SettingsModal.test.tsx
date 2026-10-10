import { cleanup,render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,expect,test,vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SettingsModal } from './SettingsModal';
import { DEFAULT_VOCABULARY_PREFERENCES } from '../../domain/vocabulary/preferences';
const context=vi.hoisted(()=>({
  calls:{save:vi.fn(),close:vi.fn(),toast:vi.fn()},
  state:{settings:{days:[1],dailyMinutes:30,vocabulary:{} as Record<string,unknown>}},
}));
context.state.settings.vocabulary=DEFAULT_VOCABULARY_PREFERENCES;
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({modal:'settings',state:context.state,closeModal:context.calls.close,saveVocabularyPreferences:context.calls.save,toast:context.calls.toast})}));
afterEach(()=>{cleanup();vi.clearAllMocks()});
test('global settings exposes account vocabulary preferences and retains failures',async()=>{
  context.calls.save.mockResolvedValue(false);render(<SettingsModal/>);const user=userEvent.setup();
  await user.click(screen.getByRole('tab',{name:'Vocabulary practice'}));
  await user.selectOptions(screen.getByRole('combobox',{name:'Accent'}),'us');
  await user.click(screen.getByRole('button',{name:'Save settings'}));
  expect(context.calls.save).toHaveBeenCalledWith(expect.objectContaining({accent:'us'}));
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
  expect(context.calls.close).not.toHaveBeenCalled();
});
