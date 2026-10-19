import { selectChoice } from '../../../tests/selectChoice';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_VOCABULARY_PREFERENCES } from '../../domain/vocabulary/preferences';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { SETTINGS_BACKUP_EVENT } from './backupActions';

const context = vi.hoisted(() => ({ current: null as any, owner: 'one', setTheme: vi.fn() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => context.current }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', setTheme: context.setTheme }) }));
vi.mock('../../storage/remote', () => ({ accountId: () => context.owner }));
vi.mock('../account/AccountPage', () => ({ AccountPage: () => <div>Account controls</div> }));
vi.mock('../vocabulary/DeviceVoicePreferences', () => ({ DeviceVoicePreferences: () => <div>Device voices</div> }));

function Location() { const location = useLocation(); return <output aria-label="Location">{location.pathname}</output>; }
function Harness({ category = 'schedule' }: { category?: string }) {
  return <MemoryRouter initialEntries={[`/settings/${category}`]}><Link to="/">Today</Link><Routes><Route path="/settings/:category?" element={<SettingsPage />} /><Route path="/" element={<p>Today content</p>} /></Routes><Location /></MemoryRouter>;
}
function setup(category = 'schedule') {
  return render(<Harness category={category} />);
}
beforeEach(() => {
  context.owner = 'one'; context.setTheme.mockReset();
  const date = '2099-01-01';
  const state = {
    settings: { examDate: '', targetBand: '', dailyMinutes: 30, focus: 'balanced', skillMix: 'mixed', speakingFocus: 'balanced', days: [1], vocabulary: { ...DEFAULT_VOCABULARY_PREFERENCES } },
    plans: [
      { id: 'automatic', title: 'Automatic task', origin: 'automatic', status: 'pending', dateKey: date },
      { id: 'manual', title: 'Manual task', origin: 'manual', status: 'pending', dateKey: date },
      { id: 'started', title: 'Started task', origin: 'automatic', status: 'in_progress', dateKey: date },
      { id: 'completed', title: 'Completed task', origin: 'automatic', status: 'completed', dateKey: date },
      { id: 'skipped', title: 'Skipped task', origin: 'automatic', status: 'skipped', dateKey: date },
      { id: 'past', title: 'Past task', origin: 'automatic', status: 'pending', dateKey: '2000-01-01' },
    ],
  };
  context.current = { state, stateRef: { current: state }, saveStudySettings: vi.fn().mockResolvedValue(true), saveVocabularyPreferences: vi.fn().mockResolvedValue(true) };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

test.each(['account', 'backup'])('%s hides unrelated save controls when there are no settings edits', category => {
  setup(category);
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument();
  expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();
});

test('pending learning settings remain saveable from the account category', async () => {
  setup(); const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  await user.click(screen.getByRole('link', { name: 'Account' }));
  expect(screen.getByText('Account controls')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveStudySettings).toHaveBeenCalledWith({ dailyMinutes: 45 });
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
});

test('weekly overrides and vocabulary allocation can be saved as actionable settings',async()=>{
 setup(); const user=userEvent.setup();
 fireEvent.change(screen.getByRole('spinbutton',{name:'Mon study minutes'}),{target:{value:'90'}});
 fireEvent.change(screen.getByRole('spinbutton',{name:'Task block minutes'}),{target:{value:'25'}});
 await user.click(screen.getByRole('button',{name:'Save settings'}));
 expect(context.current.saveStudySettings.mock.calls[0][0].planning).toMatchObject({blockMinutes:25,week:{1:{minutes:90}}});
});

test('one draft survives categories and previews only future automatic pending tasks', async () => {
  setup(); const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  expect(screen.getByRole('region', { name: 'Affected study tasks' })).toHaveTextContent('1 pending task will be rebuilt');
  await user.click(screen.getByText('1 pending task will be rebuilt'));
  expect(screen.getByText('Automatic task')).toBeInTheDocument();
  expect(screen.queryByText('Manual task')).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Vocabulary' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Learning batch size' }), { target: { value: '5' } });
  await user.click(screen.getByRole('link', { name: 'Study time' }));
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(45);
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveStudySettings).toHaveBeenCalledWith({ dailyMinutes: 45, vocabulary: { learningBatchSize: 5 } });
  expect(screen.getByText(/Settings saved\./)).toHaveAttribute('role', 'status');
});

test('audio-only changes use preference persistence with no affected-plan preview', async () => {
  setup('audio'); const user = userEvent.setup();
  await selectChoice(await screen.getByLabelText('Accent'), 'American English');
  expect(screen.queryByRole('region', { name: 'Affected study tasks' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveVocabularyPreferences).toHaveBeenCalledWith({ accent: 'us' });
  expect(context.current.saveStudySettings).not.toHaveBeenCalled();
});

test('vocabulary mode rebuilds planning via study persistence', async () => {
  setup('vocabulary'); const user = userEvent.setup();
  await selectChoice(await screen.getByLabelText('Default mode'), 'Meaning recall');
  expect(screen.getByRole('region', { name: 'Affected study tasks' })).toHaveTextContent('Automatic task');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveStudySettings).toHaveBeenCalledWith({ vocabulary: { mode: 'definition' } });
});

test('failed settings save retains all category edits and retries the same patch', async () => {
  context.current.saveStudySettings.mockResolvedValueOnce(false);
  setup(); const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your changes are still here');
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(45);
  await user.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(context.current.saveStudySettings.mock.calls.map((call: any) => call[0])).toEqual([{ dailyMinutes: 45 }, { dailyMinutes: 45 }]);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('discard resets the draft while ordinary links and departures remain guarded', async () => {
  setup(); const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  await user.click(screen.getByRole('link', { name: 'Today' }));
  expect(screen.getByRole('dialog', { name: 'Discard unsaved settings?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  const proceed = vi.fn();
  act(() => { expect(navigateWithPracticeGuard('/reading', proceed)).toBe(false); });
  expect(proceed).not.toHaveBeenCalled();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(screen.getByLabelText('Location')).toHaveTextContent('/settings/schedule');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(30);
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  await user.click(screen.getByRole('link', { name: 'Today' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/');
});

test('time presets update the weekly commitment and study-day controls are keyboard accessible', async () => {
  setup(); const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'60 min'}));
  expect(screen.getByRole('spinbutton',{name:'Minutes a day'})).toHaveValue(60);
  expect(screen.getByText('1h')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox',{name:'Tue'}));
  expect(screen.getByText('2h')).toBeInTheDocument();
  screen.getByRole('checkbox',{name:'Wed'}).focus();
  await user.keyboard(' ');
  expect(screen.getByText('3h')).toBeInTheDocument();
  await selectChoice(await screen.getByLabelText('Settings category'), 'Audio');
  expect(screen.getByRole('combobox',{name:'Accent'})).toBeInTheDocument();
});

test('background refresh keeps the draft and writes only the changed preferences', async () => {
  const view = setup('audio'); const user = userEvent.setup();
  await selectChoice(await screen.getByLabelText('Accent'), 'American English');
  context.current.state = { ...context.current.state, settings: { ...context.current.state.settings, vocabulary: { ...DEFAULT_VOCABULARY_PREFERENCES, volume: 0.4 } } };
  view.rerender(<Harness category="audio" />);
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveVocabularyPreferences).toHaveBeenCalledWith({ accent: 'us' });
});

test('theme saves locally and backup actions reach the Shell event contract', async () => {
  setup('appearance'); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dark' }));
  expect(context.setTheme).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.setTheme).toHaveBeenCalledWith('dark');
  expect(context.current.saveStudySettings).not.toHaveBeenCalled();
  expect(context.current.saveVocabularyPreferences).not.toHaveBeenCalled();
  const actions: string[] = [];
  const listener = (event: Event) => actions.push((event as CustomEvent).detail);
  document.addEventListener(SETTINGS_BACKUP_EVENT, listener);
  try {
    await user.click(screen.getByRole('link', { name: 'Backup' }));
    await user.click(screen.getByRole('button', { name: 'Export backup' }));
    await user.click(screen.getByRole('button', { name: 'Import backup' }));
    expect(actions).toEqual(['export', 'import']);
  } finally { document.removeEventListener(SETTINGS_BACKUP_EVENT, listener); }
});

test('saving locks controls and departure until a failed request completes', async () => {
  let resolve!: (saved: boolean) => void;
  context.current.saveStudySettings.mockReturnValue(new Promise<boolean>(done => { resolve = done; }));
  setup(); const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toBeDisabled();
  expect(navigateWithPracticeGuard('/reading', vi.fn())).toBe(false);
  await act(async () => resolve(false));
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toBeEnabled();
});

test('changing accounts discards the old owner draft before saving', async () => {
  const view = setup(); const user = userEvent.setup();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  context.owner = 'two';
  context.current.state = { ...context.current.state, settings: { ...context.current.state.settings, dailyMinutes: 60 } };
  view.rerender(<Harness />);
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(60);
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '65' } });
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveStudySettings).toHaveBeenCalledWith({ dailyMinutes: 65 });
});

test('selected skills persist with the legacy focus settings', async () => {
  setup('skills'); const user = userEvent.setup();
  for (const skill of ['Writing', 'Speaking', 'Listening']) await user.click(screen.getByRole('checkbox', { name: skill }));
  await selectChoice(await screen.getByLabelText('Writing focus'), 'Task 2 first');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(context.current.saveStudySettings).toHaveBeenCalledWith({ skills: ['reading'], skillMix: 'reading', focus: 'task2' });
});

test('browser Back between categories retains the draft and canceled departure restores history', async () => {
  window.history.replaceState({ idx: 0 }, '', '/');
  window.history.pushState({ idx: 1 }, '', '/settings/schedule');
  render(<BrowserRouter><Routes><Route path="/settings/:category?" element={<SettingsPage />} /><Route path="/" element={<p>Today content</p>} /></Routes><Location /></BrowserRouter>);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes a day' }), { target: { value: '45' } });
  await userEvent.setup().click(screen.getByRole('link', { name: 'Vocabulary' }));
  act(() => window.history.back());
  await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent('/settings/schedule'));
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(45);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  act(() => window.history.back());
  await screen.findByRole('dialog', { name: 'Discard unsaved settings?' });
  await waitFor(() => expect(window.location.pathname).toBe('/settings/schedule'));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('spinbutton', { name: 'Minutes a day' })).toHaveValue(45);
  act(() => window.history.back());
  await screen.findByRole('dialog', { name: 'Discard unsaved settings?' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Discard and leave' }));
  await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent(/^\/$/));
  expect(screen.getByText('Today content')).toBeInTheDocument();
});

test('practice origin survives settings category changes and a direct refresh',async()=>{
  const source='/vocabulary/review?planId=review&returnTo=%2Fplanning%3Fweek%3Dnext%23task-review';
  const query=`?returnTo=${encodeURIComponent(source)}`;
  render(<MemoryRouter initialEntries={[`/settings/vocabulary${query}`]}><Routes><Route path="/settings/:category?" element={<SettingsPage/>}/><Route path="/vocabulary/review" element={<p>Practice setup</p>}/></Routes></MemoryRouter>);
  expect(screen.getByRole('link',{name:'Back to vocabulary review'})).toHaveAttribute('href',source);
  fireEvent.click(screen.getByRole('link',{name:'Audio'}));
  expect(screen.getByRole('link',{name:'Back to vocabulary review'})).toHaveAttribute('href',source);
  fireEvent.click(screen.getByRole('link',{name:'Back to vocabulary review'}));
  expect(screen.getByText('Practice setup')).toBeInTheDocument();
});
