import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { createEmptyCard } from 'ts-fsrs';
import { vocabularySessionDrafts } from '../../storage/vocabularySessionDrafts';
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Profiler, Suspense, useState } from 'react';
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Link, useLocation, useNavigate, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VocabularyPracticePage } from "./VocabularyPracticePage";
import { completeVocabularyPlan } from '../../domain/plans';
import { getVocabularyReviewQueue, type VocabularyEntry } from "../../domain/vocabulary";
import * as vocabularyDomain from '../../domain/vocabulary';
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { createVocabularySession, evaluateVocabularySessionAnswer, updateVocabularySessionAnswer } from '../../domain/vocabulary/session';

import { freezeVocabularyPronunciation } from '../../domain/vocabulary/sensePronunciation';
import { WorkspaceScrollRestoration } from '../../components/WorkspaceScrollRestoration';

const { fb, player, owner } = vi.hoisted(() => ({
  fb: { current: null as any },
  player: { play: vi.fn(), stop: vi.fn() },
  owner: { current: "account-one" as string | null },
}));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => fb.current,
}));
vi.mock("../../storage/remote", () => ({ accountId: () => owner.current }));
vi.mock("./playback", () => ({ createVocabularyPlayback: () => player }));
vi.mock("./VocabularyPages", () => ({
  VocabularyNavigation: () => <nav aria-label="Vocabulary views" />,
}));

const originalScrollTo=window.scrollTo;
beforeEach(() => {
  vi.stubGlobal('indexedDB',new IDBFactory());
  window.scrollTo=vi.fn();
  localStorage.clear();
  sessionStorage.clear();
  owner.current = "account-one";
  player.play.mockReset().mockResolvedValue({ ok: true, source: "speech", accent: "uk", voice: "Test UK voice" });
  player.stop.mockReset();
  const vocabulary = ["resilient", "sustainable"].map((term, index) => ({
    id: `entry-${index}`,
    term,
    category: "word",
    tags: [],
    sources: [{ type: "personal", id: "personal" }],
    senses: [
      {
        id: `sense-${index}`,
        definition: `Definition ${index}`,
        example: `A ${term} community.`,
        pos: "adjective",
      },
    ],
    meaning: `Definition ${index}`,
    example: `A ${term} community.`,
    createdAt: "2020-01-01",
    updatedAt: "2020-01-01",
  }));
  const state = {
    vocabulary,
    vocabularyStates: vocabulary.map((entry,index)=>({id:`state-${index}`,entryId:entry.id,senseId:entry.senses[0].id,cards:Object.fromEntries(['dictation','definition','cloze','synonym','distinction','production'].map(mode=>[mode,createEmptyCard(new Date('2020-01-01'))])),dimensions:Object.fromEntries(['meaning','listening','spelling','usage'].map(d=>[d,{successes:0,failures:0,partials:0}])),reviewCount:0,wrong:{active:false,successesSinceFailure:0,modes:{}}})),
    vocabularyReviews: [],
    vocabularyEvidence: vocabulary.map(entry => ({entryId:entry.id,mode:'dictation',verification:'objective',result:'success'})),
    vocabularySessions: [],
    vocabularyActivities: [],
    wordbookProgress: [],
    wordbookEnrollments: [],
    settings: {},
  };
  fb.current = {
    state,
    stateRef: { current: state },
    toast: vi.fn(),
    persistNow: vi.fn(async () => true),
    saveVocabularyPreferences: vi.fn(async () => true),
    persistVocabularySession: vi.fn(async () => true),
  };
});
const originalCatalog = { books: [...VOCABULARY_CATALOG.books], units: [...VOCABULARY_CATALOG.units], entries: [...VOCABULARY_CATALOG.entries], memberships: [...VOCABULARY_CATALOG.memberships] };

test('typing in a frozen planned review does not rebuild its review queue', async () => {
  fb.current.state.settings.vocabulary = { autoPlay: false, layout: 'list' };
  fb.current.state.plans = [{ id: 'typing-plan', kind: 'vocabulary', status: 'in_progress', startedAt: '2020-01-01', target: { type: 'vocabulary', mode: 'due-review', binding: 'frozen', assessmentMode: 'dictation', cards: fb.current.state.vocabulary.map((entry: VocabularyEntry) => ({entryId: entry.id, senseId: entry.senses[0].id})) } }];
  const queue = vi.spyOn(vocabularyDomain, 'getVocabularyReviewQueue');
  try {
    mount('?planId=typing-plan&mode=dictation&dueOnly=false');
    fireEvent.click(await readyStart());
    const before = queue.mock.calls.length;
    const input = screen.getByRole('textbox', { name: 'Answer 1' });
    for (const value of ['r', 're', 'res', 'resilient']) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
    expect(queue.mock.calls.length).toBe(before);
    fireEvent(window, new Event('pagehide'));
    await waitFor(async()=>{const draft=await latestDraft();expect(draft?.answers[draft.cardIds[0].id]?.response).toBe('resilient');});
  } finally { queue.mockRestore(); }
});

test('typing updates immediately without writing the full draft per letter, then pagehide flushes the latest answer', async () => {
  fb.current.state.settings.vocabulary = { autoPlay: false };
  mount('?mode=dictation&dueOnly=false');
  fireEvent.click(await readyStart());
  const input = screen.getByRole('textbox', { name: 'Answer 1' });
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  for (const value of ['c', 'ca', 'cat', 'cata', 'catastrophic']) {
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveValue(value);
  }
  expect(writes.mock.calls.filter(([key]) => key.startsWith('fieldbook-vocabulary-draft'))).toHaveLength(0);
  fireEvent(window, new Event('pagehide'));
  await waitFor(async()=>{const current=await latestDraft();expect(current?.answers[current.cardIds[0].id]?.response).toBe('catastrophic');});
  writes.mockRestore();
});

test('a stale tab cannot submit over a newer local draft revision', async () => {
  fb.current.state.settings.vocabulary = { autoPlay: false };
  mount('?mode=dictation&dueOnly=false');
  fireEvent.click(await readyStart());
  await savedDraft();
  const [row] = await vocabularySessionDrafts.list(owner.current!);
  const otherTab = { ...row.session, answers: { ...row.session.answers } };
  await vocabularySessionDrafts.save(owner.current!, otherTab, row.revision);
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer 1' }), { target: { value: 'resilient' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer 2' }), { target: { value: 'sustainable' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit session' }));
  expect(await screen.findByText(/pause here and reload its saved draft before submitting/)).toBeInTheDocument();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('resilient');
  expect((await vocabularySessionDrafts.list(owner.current!))[0].revision).toBe(row.revision + 1);
});

test('a local draft conflict offers an explicit reload of the newer answers', async () => {
  fb.current.state.settings.vocabulary={autoPlay:false};
  mount('?mode=dictation&dueOnly=false');fireEvent.click(await readyStart());await savedDraft();
  const [row]=await vocabularySessionDrafts.list(owner.current!);
  const cardId=row.session.cardIds[0].id;
  const other=updateVocabularySessionAnswer(row.session,cardId,'newer answer');
  await vocabularySessionDrafts.save(owner.current!,other,row.revision);
  fireEvent.change(screen.getByRole('textbox',{name:'Answer 1'}),{target:{value:'this tab answer'}});
  fireEvent(window,new Event('pagehide'));
  fireEvent.click(await screen.findByRole('button',{name:'Reload saved draft'}));
  expect(screen.getByRole('textbox',{name:'Answer 1',hidden:true})).toHaveValue('this tab answer');
  const dialog=screen.getByRole('dialog',{name:'Reload saved answers?'});
  expect(dialog).toHaveTextContent('replaces the answers in this tab');
  fireEvent.click(screen.getByRole('button',{name:'Replace with saved answers'}));
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Answer 1'})).toHaveValue('newer answer'));
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('discarding a just-typed session cancels its pending save so the draft cannot reappear', async () => {
  fb.current.state.settings.vocabulary = { autoPlay: false };
  mount('?mode=dictation&dueOnly=false');
  fireEvent.click(await readyStart());
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer 1' }), { target: { value: 'latest' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pause session' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Discard session' }));
  fireEvent(window, new Event('pagehide'));
  await new Promise(resolve => setTimeout(resolve, 350));
  await waitFor(async()=>expect((await latestDraft())).toBeNull());
});

test('historical dictation labels separate meanings of a repeated word without dropping either saved result', async () => {
  const entry = fb.current.state.vocabulary[0];
  const results = ['First meaning.', 'Another meaning.'].map((definition, index) => ({cardId:`saved-${index}`, entryId:entry.id, senseId:`saved-sense-${index}`, term:entry.term, response:entry.term, expectedAnswer:entry.term, result:'success', definition, example:''}));
  fb.current.state.vocabularySessions = [{id:'repeated-meanings', mode:'dictation', status:'submitted', preferences:{}, filter:{}, results, entryIds:[entry.id], summary:{total:2,correct:2,incorrect:0,pending:0}, startedAt:'2025-01-01', submittedAt:'2025-01-01'}];
  const before = structuredClone(fb.current.state.vocabularySessions);
  mount('?sessionId=repeated-meanings');
  expect(await screen.findByText('This saved session includes separate meanings of the same word.')).toBeInTheDocument();
  expect(screen.getByText('Meaning 1 of 2')).toBeInTheDocument();
  expect(screen.getByText('Meaning 2 of 2')).toBeInTheDocument();
  expect(screen.getByText('First meaning.')).toBeInTheDocument();
  expect(screen.getByText('Another meaning.')).toBeInTheDocument();
  screen.getAllByRole('link', { name: 'Details' }).forEach((link, index) => {
    expect(new URL(link.getAttribute('href')!, 'https://test.test').searchParams.get('senseId')).toBe(`saved-sense-${index}`);
  });
  expect(screen.getByRole('heading', { name:'2 of 2 correct' })).toBeInTheDocument();
  expect(fb.current.state.vocabularySessions).toEqual(before);
});
test('dictation uses the frozen selected reading and exposes deliberate audio recovery without grading it',async()=>{
  const raw=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8')).entries.find((e:any)=>e.term==='record');
  const row=JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json','utf8')).find((r:any)=>r.senseId==='kaikki:5386f9871d2cf75669');
  const sense={...row.originalSense,definition:row.definition,example:row.example};
  const entry={...raw,senses:[sense]};fb.current.state.vocabulary=[entry];fb.current.state.settings.vocabulary={autoPlay:false,accent:'uk'};
  player.play.mockResolvedValueOnce({ok:false,source:'none',reason:'sense-recording-unavailable',accent:'uk'}).mockResolvedValue({ok:true,source:'recording',accent:'us',senseMatch:'matched'});
  mount(`?entryId=${entry.id}&senseId=${sense.id}&dueOnly=false&mode=dictation`);
  fireEvent.click(await readyStart());
  fireEvent.click(screen.getByRole('button',{name:'Replay current word'}));
  await waitFor(()=>expect(player.play).toHaveBeenCalledWith(expect.objectContaining({id:entry.id}),expect.objectContaining({sense:expect.objectContaining({id:sense.id}),pronunciation:freezeVocabularyPronunciation(entry,sense)})));
  fireEvent.click(await screen.findByRole('button',{name:'Play matching US recording'}));
  await waitFor(()=>expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({id:entry.id}),expect.objectContaining({accent:'us',pronunciation:freezeVocabularyPronunciation(entry,sense)})));
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  expect(fb.current.state.vocabularyReviews).toEqual([]);
  const draft=await savedDraft();expect(draft.answers).toEqual({});
  expect(draft.cardSnapshots![0].pronunciation).toEqual(freezeVocabularyPronunciation(entry,sense));
});
test('audio-loop failure retains the missing-reading explanation and never records a listened activity',async()=>{
  const raw=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8')).entries.find((e:any)=>e.term==='record');
  const row=JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json','utf8')).find((r:any)=>r.senseId==='kaikki:5386f9871d2cf75669');
  const sense={...row.originalSense,definition:row.definition,example:row.example};
  fb.current.state.vocabulary=[{...raw,senses:[sense]}];fb.current.state.settings.vocabulary={autoPlay:false,accent:'uk'};
  player.play.mockResolvedValue({ok:false,source:'none',reason:'sense-recording-unavailable',accent:'uk'});
  mount(`?entryId=${raw.id}&senseId=${sense.id}&dueOnly=false&mode=audio`);
  fireEvent.click(await readyStart());
  fireEvent.click(screen.getByRole('button',{name:'Play loop'}));
  await waitFor(()=>expect(screen.getByRole('group',{name:'Pronunciation recovery'})).toBeInTheDocument());
  expect(screen.getByText(/No verified UK recording for this meaning/)).toBeInTheDocument();
  expect(screen.queryByText('Audio loop complete')).not.toBeInTheDocument();
  await waitFor(async()=>expect((await latestDraft())?.answers).toEqual({}));
  expect(fb.current.state.vocabularyActivities).toEqual([]);
});
test('the home due-review link launches only saved meanings with an actual due schedule and freezes that restriction',async()=>{
  const state=fb.current.state;
  state.vocabularyStates=[{id:'scheduled',entryId:'entry-0',senseId:'sense-0',cards:{definition:{due:'2020-01-01'}},wrong:{active:false,modes:{}},dimensions:{}}];
  mount('?mode=definition&dueOnly=true&scheduledOnly=true');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toHaveAttribute('aria-busy','false'));
  expect(screen.getByText(/1 word ·/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  await waitFor(async()=>expect((await latestDraft())?.filter).toMatchObject({dueOnly:true,scheduledOnly:true}));
  await waitFor(async()=>expect((await latestDraft())?.cardIds).toEqual([expect.objectContaining({entryId:'entry-0',senseId:'sense-0'})]));
});

test('single-word practice keeps its meaning and feedback without bulk settings or resetting saved preferences', async () => {
  fb.current.state.settings.vocabulary = { sessionSize: 50, order: 'random', feedback: 'end', layout: 'list', autoPlay: false };
  const user = userEvent.setup();
  mount('?entryId=entry-0&senseId=sense-0&dueOnly=false&mode=definition');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  for (const name of ['Wordbook', 'Session size', 'Order']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  for (const name of ['Due only', 'Mistakes only']) expect(screen.queryByRole('checkbox', { name })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Practice layout' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Feedback' }));
  await user.click(screen.getByRole('option', { name: 'After each answer' }));
  await user.click(await readyStart());
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  await user.type(screen.getByRole('textbox', { name: 'Answer 1' }), 'resilient');
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  await waitFor(() => expect(fb.current.persistVocabularySession).toHaveBeenCalledTimes(1));
  const [prepared] = fb.current.persistVocabularySession.mock.calls[0];
  expect(prepared.vocabularySessions[0]).toMatchObject({
    preferences: { sessionSize: 50, order: 'random', feedback: 'immediate', layout: 'list' },
    results: [expect.objectContaining({ entryId: 'entry-0', senseId: 'sense-0' })],
  });
});

test('an explicitly filtered single-word link keeps its active filters removable', async () => {
  mount('?entryId=entry-0&senseId=sense-0&dueOnly=true&mode=definition');
  const due = await screen.findByRole('button', { name: 'Remove due filter' });
  await userEvent.click(due);
  expect(screen.queryByRole('button',{name:'Remove due filter'})).not.toBeInTheDocument();
  await readyStart();
});
test.each(['cloze', 'synonym', 'distinction'])('an unsupported single-meaning %s task retains the meaning and offers exact meaning recall', async mode => {
  const entry = fb.current.state.vocabulary[0];
  entry.senses[0].example = '';
  const before = JSON.stringify(fb.current.state);
  mount(`?entryId=${entry.id}&senseId=${entry.senses[0].id}&dueOnly=false&mode=${mode}`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  expect(screen.queryByText('This selected meaning is unavailable.')).not.toBeInTheDocument();
  expect(screen.getByText('No exercise is available for this meaning in this mode.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
  expect(JSON.stringify(fb.current.state)).toBe(before);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Try Meaning recall' }));
  expect(screen.getByRole('button', { name: 'Practice mode' })).toHaveTextContent('Meaning recall');
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  expect(fb.current.persistNow).not.toHaveBeenCalled();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  await user.click(await readyStart());
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  await user.type(screen.getByRole('textbox', { name: 'Answer 1' }), 'resilient');
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
  const saved = fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0];
  expect(saved).toMatchObject({ mode: 'definition', filter: { entryId: entry.id, senseId: entry.senses[0].id, dueOnly: false }, results: [expect.objectContaining({ entryId: entry.id, senseId: entry.senses[0].id })] });
});

test.each(['future', 'no-mistakes'])('a %s scheduling filter does not turn an existing meaning into unavailable content', async restriction => {
  const entry = fb.current.state.vocabulary[0];
  fb.current.state.vocabularyStates = [{ entryId: entry.id, senseId: entry.senses[0].id, cards: { definition: { due: '2099-01-01' } }, wrong: { active: false, modes: {} } }];
  mount(`?entryId=${entry.id}&senseId=${entry.senses[0].id}&mode=definition&dueOnly=${restriction === 'future'}&wrongOnly=${restriction === 'no-mistakes'}`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  expect(screen.getByText('No words match these filters.')).toBeInTheDocument();
  expect(screen.queryByText('This selected meaning is unavailable.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
  expect(fb.current.persistNow).not.toHaveBeenCalled();
});

test('an archived meaning stays readable without a suggested practice bypass', async () => {
  fb.current.state.vocabulary[0].tags = ['archived'];
  mount('?entryId=entry-0&senseId=sense-0&dueOnly=false&mode=cloze');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
});

test('an unknown exact meaning does not offer practice of a different saved meaning', async () => {
  mount('?entryId=entry-0&senseId=unknown-meaning&dueOnly=false&mode=cloze');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByText('This selected meaning is unavailable.')).toBeInTheDocument();
  expect(screen.queryByText('Definition 0')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
});

test('a supported-mode suggestion preserves scheduling and source restrictions', async () => {
  const entry = fb.current.state.vocabulary[0];
  entry.senses[0].example = '';
  entry.sources = [{ type: 'reading', id: 'part-one', skill: 'reading', senseId: 'sense-0' }];
  fb.current.state.vocabularyStates = [{ entryId: entry.id, senseId: 'sense-0', cards: { definition: { due: '2099-01-01' } } }];
  const query = '?entryId=entry-0&senseId=sense-0&dueOnly=true&sourceType=reading&sourceId=part-one&skill=reading&mode=cloze';
  function CurrentSelection() { const location = useLocation(); return <output aria-label="Focused route">{location.search}</output>; }
  render(<MemoryRouter initialEntries={['/vocabulary/review' + query]}><VocabularyPracticePage /><CurrentSelection /></MemoryRouter>);
  await userEvent.click(await screen.findByRole('button', { name: 'Try Meaning recall' }));
  const params = new URLSearchParams(screen.getByLabelText('Focused route').textContent!);
  for (const [key, value] of new URLSearchParams(query)) expect(params.get(key)).toBe(key === 'mode' ? 'definition' : value);
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
  expect(screen.getByText('No words match these filters.')).toBeInTheDocument();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('a meaning-group reference stays readable without a suggested practice mode', async () => {
  const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  const entry = catalog.entries.find((item: any) => item.term === 'note');
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const sense = JSON.parse(readFileSync('public/dictionary/' + index.note, 'utf8')).senses[0];
  const correction = JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json', 'utf8')).find((row: any) => row.entryId === entry.id && row.senseId === sense.id);
  fb.current.state.vocabulary = [{ ...entry, senses: [sense] }];
  mount(`?entryId=${entry.id}&senseId=${sense.id}&dueOnly=false&mode=cloze`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toHaveAttribute('aria-busy', 'false'));
  expect(screen.getByText(correction.definition)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
});

test('a supported-mode suggestion waits for the selected meaning’s catalogue preparation', async () => {
  fb.current.state.vocabulary[0].senses[0].example = '';
  let finish!: () => void;
  fb.current.loadVocabularyCatalog = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  mount('?entryId=entry-0&senseId=sense-0&dueOnly=false&mode=cloze');
  expect(screen.getByText('Loading your selected meaning…')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
  await act(async () => finish());
  expect(await screen.findByRole('button', { name: 'Try Meaning recall' })).toBeInTheDocument();
  expect(screen.getByText('Definition 0')).toBeInTheDocument();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('free review exposes named controls, custom size and text layout choices', async () => {
  mount('?dueOnly=false');
  await readyStart();
  for(const name of ['Mode','Word source','Review type','Session size','Question order','Feedback timing','Practice layout']) expect(screen.getByText(name,{selector:'.practice-field-label'})).toBeVisible();
  expect(screen.getByRole('spinbutton',{name:'Custom question count'})).toBeVisible();
  expect(screen.getByRole('button',{name:'List layout'})).toHaveTextContent('List');
  expect(screen.getByRole('button',{name:'Focus layout'})).toHaveTextContent('Focus');
  for(const name of ['Due only','Mistakes only'])expect(screen.queryByRole('checkbox',{name})).not.toBeInTheDocument();
});

test('planned review exposes its locked mode, full prompt count and origin without free-review controls', async () => {
  const entry = fb.current.state.vocabulary[0];
  entry.senses = Array.from({ length: 56 }, (_, index) => ({ ...entry.senses[0], id: `planned-sense-${index}` }));
  const refs = entry.senses.map((sense: { id: string }) => ({ entryId: entry.id, senseId: sense.id }));
  fb.current.state.plans = [{ id: 'locked-layout', kind: 'vocabulary', status: 'in_progress', target: { type: 'vocabulary', mode: 'due-review', assessmentMode: 'definition', cards: refs } }];
  fb.current.state.settings.vocabulary = { sessionSize: 5 };
  mount('?planId=locked-layout&mode=dictation&wrongOnly=true&returnTo=%2Fplanning%3Fweek%3Dnext');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  const task = screen.getByRole('region', { name: 'Planned task' });
  expect(task).toHaveTextContent('Meaning recall');
  expect(task).toHaveTextContent('56 prompts');
  expect(task).toHaveTextContent('Planning');
  expect(task).toHaveTextContent('Locked');
  for (const name of ['Review mode', 'Practice mode', 'Wordbook', 'Review preset', 'Session size', 'Order']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Mistakes only' })).not.toBeInTheDocument();
  expect(screen.queryByText('Mistake recovery needs 3 correct retries in the same mode, with at least 24 hours between the first and last.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument();
  for (const name of ['Session size', 'Order']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  for (const name of ['Due only', 'Mistakes only']) expect(screen.queryByRole('checkbox', { name })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  await waitFor(async()=>expect((await latestDraft())?.cardIds).toHaveLength(56));
  await waitFor(async()=>expect((await latestDraft())?.mode).toBe('definition'));
});

test.each([false, true])('locked source ignores hostile URL wordbook/group and retains only bound scope (scoped=%s)', async scoped => {
  groupFixture(2);
  VOCABULARY_CATALOG.books.push({ id: 'unrelated-book', title: 'Unrelated book', contentStatus: 'complete' } as any);
  VOCABULARY_CATALOG.units.push({ id: 'unrelated-group', bookId: 'unrelated-book', title: 'Unrelated group', kind: 'group', contentStatus: 'complete' } as any);
  const refs = [{ entryId: 'group-entry-0', senseId: 'group-sense-0' }];
  fb.current.state.plans = [{ id: 'scope-plan', kind: 'vocabulary', status: 'in_progress', target: { type: 'vocabulary', mode: 'due-review', assessmentMode: 'definition', cards: refs, ...(scoped ? { bookId: 'test-book', unitId: 'test-group' } : {}) } }];
  mount('?planId=scope-plan&bookId=unrelated-book&unitId=unrelated-group&returnTo=%2Fplanning');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  const task = screen.getByRole('region', { name: 'Planned task' });
  expect(task).toHaveTextContent('Planning');
  expect(task).not.toHaveTextContent('Unrelated book');
  expect(task).not.toHaveTextContent('Unrelated group');
  if (scoped) {
    expect(task).toHaveTextContent('Test book');
    expect(task).toHaveTextContent('Group 1');
  } else {
    expect(task).not.toHaveTextContent('Test book');
    expect(task).not.toHaveTextContent('Group 1');
  }
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  await waitFor(async()=>expect((await latestDraft())?.selection).toMatchObject({ kind: 'planned-review', cards: refs }));
});

test('an empty legacy sessionId keeps free setup available instead of an indefinite results loader', async () => {
  mount('?sessionId=&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  expect(screen.queryByText('Loading session results…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(2);
});

test.each(['ready', 'error'])('single-word launch distinguishes content preparation from %s outcome', async outcome => {
  let resolve!: () => void, reject!: (error: Error) => void;
  fb.current.loadVocabularyCatalog = vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
  render(<MemoryRouter initialEntries={['/vocabulary/review?entryId=missing-entry&dueOnly=false']}><VocabularyPracticePage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Start session' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Preparing practice…');
  expect(screen.queryByText('This selected meaning is unavailable.')).not.toBeInTheDocument();
  expect(screen.queryByText('No words match these filters.')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Explore wordbooks' })).not.toBeInTheDocument();
  await act(async () => { if (outcome === 'ready') resolve(); else reject(new Error('offline')); });
  if (outcome === 'ready') {
    expect(screen.getByText('This selected meaning is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('No words match these filters.')).toBeInTheDocument();
  } else {
    expect(screen.getByText('The wordbook could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('This selected meaning is unavailable.')).not.toBeInTheDocument();
    expect(screen.queryByText('No words match these filters.')).not.toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
});
test.each([true, false])('saved result table recovery preserves workspace scroll ownership (%s)', async restored => {
  fb.current.state.vocabularySessions = [{ id: 'scroll-history', mode: 'dictation', status: 'submitted', filter: {}, selection: { kind: 'review' }, preferences: {}, results: [], summary: { total: 0, correct: 0, incorrect: 0, pending: 0 }, startedAt: '2026-10-12', submittedAt: '2026-10-12' }];
  sessionStorage.setItem('fieldbook:session-position:account-one:scroll-history:all', JSON.stringify({ y: 500, x: 37, tableY: 18 }));
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  try {
    render(<MemoryRouter initialEntries={[{ pathname: '/vocabulary/history/scroll-history', key: 'result-entry' }]}><WorkspaceScrollRestoration.Provider value={{ current: { key: 'result-entry', restored } }}><Routes><Route path="/vocabulary/history/:sessionId" element={<VocabularyPracticePage />} /></Routes></WorkspaceScrollRestoration.Provider></MemoryRouter>);
    const table = await screen.findByRole('region', { name: 'Session word results' });
    await waitFor(() => expect(table.scrollLeft).toBe(37));
    expect(table.scrollTop).toBe(18);
    if (restored) expect(scroll).not.toHaveBeenCalled();
    else expect(scroll).toHaveBeenCalledWith(0, 500);
  } finally { scroll.mockRestore(); }
});
test('planned batch ignores query mode mutation and submits exact frozen cards in target mode', async () => {
  groupFixture(2);
  const refs=VOCABULARY_CATALOG.memberships.filter(member=>member.bookId==='test-book').map(member=>({entryId:member.entryId,senseId:`group-sense-${member.order}`}));
  fb.current.state.plans=[{id:'planned-mode',kind:'vocabulary',status:'in_progress',startedAt:'2020-01-01',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'definition',bookId:'test-book',unitId:'test-group',batchIndex:0,batchSize:2,cards:refs}}];
  mount(`?bookId=test-book&unitId=test-group&dueOnly=false&planId=planned-mode&mode=dictation&batch=0&batchSize=2&batchCards=${encodeURIComponent(JSON.stringify(refs))}`);
  const user=userEvent.setup();
  await user.click(await readyStart());
  const draft=(await savedDraft());
  expect(draft.mode).toBe('definition');
  expect(draft.planId).toBe('planned-mode');
  expect(draft.selection.cards).toEqual(refs);
  await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'word0');
  await user.type(screen.getByRole('textbox',{name:'Answer 2'}),'word1');
  await user.click(screen.getByRole('button',{name:'Submit session'}));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
  const submitted=fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0];
  expect(submitted).toMatchObject({mode:'definition',planId:'planned-mode',selection:{cards:refs}});
  expect(completeVocabularyPlan(fb.current.state,submitted)).toMatchObject({id:'planned-mode',status:'completed'});
});
afterEach(() => { cleanup(); window.scrollTo=originalScrollTo; Object.assign(VOCABULARY_CATALOG, originalCatalog); });
function groupFixture(count: number) {
  const vocabulary = Array.from({ length: count }, (_, index) => ({
    ...fb.current.state.vocabulary[0], id: `group-entry-${index}`, term: `word${index}`,
    senses: [{ ...fb.current.state.vocabulary[0].senses[0], id: `group-sense-${index}` }],
    sources: [{ type: 'wordbook', id: `source-${index}`, bookId: 'test-book', unitId: 'test-group' }],
  }));
  fb.current.state.vocabulary = [...vocabulary].reverse();
  fb.current.loadVocabularyCatalog = vi.fn(async () => true);
  VOCABULARY_CATALOG.books = [...originalCatalog.books, { id: 'test-book', title: 'Test book', contentStatus: 'complete' } as any];
  VOCABULARY_CATALOG.units = [...originalCatalog.units, { id: 'test-chapter', bookId: 'test-book', title: 'Natural geography', kind: 'chapter' }, { id: 'test-group', bookId: 'test-book', title: 'Group 1', parentId: 'test-chapter', kind: 'group', contentStatus: 'complete', totalSourceWords: count } as any];
  VOCABULARY_CATALOG.entries = [...originalCatalog.entries, ...vocabulary];
  VOCABULARY_CATALOG.memberships = [...originalCatalog.memberships, ...vocabulary.map((entry, order) => ({ id: `membership-${order}`, entryId: entry.id, bookId: 'test-book', unitId: 'test-group', order })) as any];
}

test('group mode menu excludes unavailable tasks and old empty mode links recover',async()=>{
  groupFixture(2);
  mount('?bookId=test-book&unitId=test-group&dueOnly=false&mode=synonym');
  expect(await screen.findByText(/Synonyms has no tasks in this group/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Practice mode'})).toHaveTextContent('Dictation');
  await userEvent.setup().click(screen.getByRole('button',{name:'Practice mode'}));
  expect(screen.queryByRole('option',{name:/Synonyms/})).not.toBeInTheDocument();
  expect(screen.queryByRole('option',{name:/Word distinctions/})).not.toBeInTheDocument();
  expect(screen.queryByRole('option',{name:/Sentence gaps/})).not.toBeInTheDocument();
  expect(screen.getByRole('option',{name:'Meaning recall · 2 words'})).toBeInTheDocument();
  expect(screen.getByRole('option',{name:'Audio loop · 2 words · Listening activity'})).toBeInTheDocument();
});

test('empty mode recovery notice belongs to its group and clears on source navigation',async()=>{
  groupFixture(2);
  const base='/vocabulary/study?bookId=test-book&unitId=test-group&dueOnly=false';
  render(<MemoryRouter initialEntries={[base+'&mode=synonym']}><VocabularyPracticePage/><Link to="/vocabulary/study?bookId=test-book&unitId=another-group&dueOnly=false&mode=dictation">Another group</Link></MemoryRouter>);
  await screen.findByText(/Synonyms has no tasks in this group/);
  await userEvent.setup().click(screen.getByRole('link',{name:'Another group'}));
  expect(screen.queryByText(/Synonyms has no tasks in this group/)).not.toBeInTheDocument();
});

test('fixed learning batch ignores review size, resumes from home, and submits its exact planned references', async () => {
  groupFixture(13);
  fb.current.booted = true;
  fb.current.state.settings.vocabulary = { sessionSize: 1, autoPlay: false };
  const refs = Array.from({length:10},(_,index)=>({entryId:`group-entry-${index}`,senseId:`group-sense-${index}`}));
  fb.current.state.plans=[{id:'planned-batch',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'dictation',bookId:'test-book',unitId:'test-group',batchIndex:0,batchSize:10,cards:refs}}];
  const query = `?${new URLSearchParams({bookId:'test-book',unitId:'test-group',dueOnly:'false',batch:'0',batchSize:'10',batchCards:JSON.stringify(refs),planId:'planned-batch'})}`;
  const user = userEvent.setup();
  const view = mount(query);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());
  await user.click(await readyStart());
  expect(screen.getAllByRole('textbox')).toHaveLength(10);
  fireEvent.change(screen.getByRole('textbox',{name:'Answer 1'}),{target:{value:'word0'}});
  await user.click(screen.getByRole('button',{name:'Exit session'}));
  await user.click(screen.getByRole('button',{name:'Keep progress'}));
  view.unmount();
  mount(`${query}&resume=true`);
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Answer 1'})).toHaveValue('word0'));
  for(let index=1;index<10;index++) fireEvent.change(screen.getByRole('textbox',{name:`Answer ${index+1}`}),{target:{value:`word${index}`}});
  await user.click(screen.getByRole('button',{name:'Submit session'}));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalledTimes(1));
  const [prepared] = fb.current.persistVocabularySession.mock.calls[0];
  expect(prepared.vocabularySessions[0]).toMatchObject({planId:'planned-batch',selection:{kind:'learning-batch',cards:refs}});
  expect(await screen.findByRole('link',{name:'Next batch'})).toHaveAttribute('href',expect.stringContaining('batch=1'));
});

test("whole group uses all 55 words in source order and preserves answers across pages and recovery", async () => {
  const user = userEvent.setup();
  groupFixture(55);
  const view = mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Session size' })).not.toBeInTheDocument();
  await user.click(await readyStart());
  expect(screen.getAllByRole('textbox')).toHaveLength(50);
  await waitFor(() => expect(player.play).toHaveBeenCalledWith(expect.objectContaining({ term: 'word0' }), expect.anything()));
  await user.click(screen.getByRole('textbox', { name: 'Answer 1' }));
  await user.paste('river 2');
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(5);
  await user.click(screen.getByRole('textbox', { name: 'Answer 51' }));
  await user.paste('word50');
  await user.click(screen.getByRole('button', { name: 'Exit session' }));
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  view.unmount();
  mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await user.click(await screen.findByRole('button', { name: 'Resume session' }));
  expect(screen.getByRole('textbox', { name: 'Answer 51' })).toHaveValue('word50');
  await user.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('river 2');
}, 15_000);

test("235-word group submits one frozen full-group attempt beyond the old cap", async () => {
  const user = userEvent.setup();
  groupFixture(235);
  mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(await readyStart());
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  await user.click(screen.getByRole('button', { name: 'Submit anyway' }));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalledTimes(1));
  const [prepared] = fb.current.persistVocabularySession.mock.calls[0];
  expect(prepared.vocabularyReviews).toHaveLength(235);
  expect(prepared.vocabularySessions[0].selection).toEqual({ kind: 'unit', bookId: 'test-book', unitId: 'test-group' });
}, 15_000);

test("catalog-only draft recovery waits for the saved book and retains answers when loading fails", async () => {
  const user = userEvent.setup();
  groupFixture(235);
  const savedCatalog = { ...VOCABULARY_CATALOG };
  const view = mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(await readyStart());
  await user.click(screen.getByRole('textbox', { name: 'Answer 1' }));
  await user.paste('saved-answer');
  await user.click(screen.getByRole('button', { name: 'Exit session' }));
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  view.unmount();
  fb.current.state.vocabulary = [];
  Object.assign(VOCABULARY_CATALOG, originalCatalog);
  fb.current.loadVocabularyCatalog.mockRejectedValue(new Error('offline'));
  mount();
  await user.click(await screen.findByRole('button', { name: 'Resume session' }));
  expect(screen.getByText(/The saved wordbook could not be loaded/)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Resume session' })).toBeEnabled();
  let release: () => void;
  fb.current.loadVocabularyCatalog.mockImplementationOnce(() => new Promise<void>(resolve => {
    release = () => { Object.assign(VOCABULARY_CATALOG, savedCatalog); resolve(); };
  }));
  await user.click(await screen.findByRole('button', { name: 'Resume session' }));
  expect(screen.getByRole('button', { name: 'Loading session…' })).toBeDisabled();
  expect(fb.current.loadVocabularyCatalog).toHaveBeenLastCalledWith('test-book', expect.objectContaining({ unitId: 'test-group' }));
  release!();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('saved-answer'));
  expect(screen.getByText('1–50 of 235')).toBeInTheDocument();
});

test("dictation shortcuts navigate without stealing answer text and pause with Escape", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await readyStart());
  const first = screen.getByRole("textbox", { name: "Answer 1" });
  await user.type(first, "river 2");
  expect(first).toHaveValue("river 2");
  fireEvent.keyDown(first, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Answer 2" })).toHaveFocus());
  const second = screen.getByRole("textbox", { name: "Answer 2" });
  player.play.mockClear();
  fireEvent.keyDown(second, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(player.play).toHaveBeenCalled());
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: "ArrowUp", isComposing: true });
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: "Escape" });
  expect(screen.getByRole("dialog")).toHaveTextContent("Keep");
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("production textarea retains multiline editing on Enter and arrows", async () => {
  const user = userEvent.setup();
  mount("?mode=production");
  await user.click(await readyStart());
  const first = screen.getByRole("textbox", { name: "Answer 1" });
  await user.type(first, "A river.{enter}Second line");
  expect(first).toHaveValue("A river.\nSecond line");
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(first).toHaveFocus();
});

test("self-review selects open with arrow keys and restore practice focus after selection", async () => {
  const user = userEvent.setup();
  mount('?mode=production');
  await user.click(await readyStart());
  await user.type(screen.getByRole('textbox', { name: 'Answer 1' }), 'A resilient community.');
  const rating = screen.getByRole('combobox', { name: 'Self review 1' });
  rating.focus();
  const prevented = !fireEvent.keyDown(rating, { key: 'ArrowDown', cancelable: true });
  expect(prevented).toBe(true);
  await user.click(await screen.findByRole('option',{name:'Looks correct'}));
  expect(rating).toHaveTextContent('Looks correct');
  await waitFor(() => expect(rating).toHaveFocus());
  // Wait beyond the workbench animation frame: it must not steal select focus.
  await new Promise(resolve=>setTimeout(resolve,40));
  expect(rating).toHaveFocus();
});

test("distinction choice focus targets the correct word and preserves radio navigation", async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary.forEach((entry: any) => { entry.senses[0].distinctionTask = { prompt: 'Choose a synonym', options: ['A', 'B'], answer: 'A', explanation: 'A is correct.' }; });
  mount('?mode=distinction');
  await user.click(await readyStart());
  const radio = screen.getAllByRole('radio')[2];
  await user.click(radio);
  expect(fireEvent.keyDown(radio, { key: 'ArrowDown', cancelable: true })).toBe(true);
  player.play.mockClear();
  fireEvent.keyDown(radio, { key: 'Enter', ctrlKey: true });
  await waitFor(() => expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({ term: 'sustainable' }), expect.anything()));
});

test("result filters preserve marked rows and mistake retry ignores the review batch size", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = { sessionSize: 1 };
  groupFixture(55);
  mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(await readyStart());
  await user.click(screen.getByRole('button', { name: 'Flag word 1' }));
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  await user.click(screen.getByRole('button', { name: 'Submit anyway' }));
  await user.click(await screen.findByRole('button', { name: 'Result filter' }));
  await user.click(screen.getByRole('option', { name: 'Flagged' }));
  expect(screen.getAllByRole('row')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Retry mistakes' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(50);
  expect(screen.getByText('1–50 of 55')).toBeInTheDocument();
});
async function latestDraft(account=owner.current){return account?(await vocabularySessionDrafts.list(account))[0]?.session||null:null;}
async function savedDraft(){let result;await waitFor(async()=>{result=await latestDraft();expect(result).not.toBeNull();});return result!;}
async function readyStart(){const button=await screen.findByRole('button',{name:'Start session'});await waitFor(()=>expect(button).toBeEnabled());return button;}
function mount(query = "") {
  return render(
    <MemoryRouter initialEntries={[`/vocabulary/review${query}`]}>
      <VocabularyPracticePage />
    </MemoryRouter>,
  );
}

test('exact Part review includes collected words without advancing learning before submission', async () => {
  const entry = fb.current.state.vocabulary[0];
  entry.sources = [{ type: 'reading', id: 'part-one', senseId: entry.senses[0].id, exam: { sectionId: 'part-one', paragraphId: 'A', quote: 'resilient' } }];
  fb.current.state.vocabularyEvidence = [];
  mount('?sourceType=reading&sourceId=part-one&mode=definition&dueOnly=false');
  await userEvent.setup().click(await readyStart());
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  expect(fb.current.state.vocabularyEvidence).toEqual([]);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  await waitFor(async()=>expect((await latestDraft())?.filter).toMatchObject({ sourceType: 'reading', sourceId: 'part-one' }));
});

test('a saved result has a return to history and New session opens setup rather than its origin',async()=>{
  const log={id:'saved-return',mode:'dictation',status:'submitted',filter:{dueOnly:false},selection:{kind:'review'},preferences:{},results:[],summary:{total:0,correct:0,incorrect:0,pending:0},submittedAt:'2026-10-12',startedAt:'2026-10-12'};
  fb.current.state.vocabularySessions=[log];
  function CurrentURL(){const l=useLocation();return <output aria-label='Current URL'>{l.pathname+l.search}</output>;}
  render(<MemoryRouter initialEntries={['/vocabulary/history/saved-return?returnTo=%2Fvocabulary%2Fhistory']}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/><Route path='/vocabulary/review' element={<VocabularyPracticePage/>}/><Route path='/vocabulary/history' element={<p>History list</p>}/></Routes><CurrentURL/></MemoryRouter>);
  await screen.findByRole('heading',{name:/of .* correct/});
  expect(screen.getByRole('link',{name:'Back to history'})).toHaveAttribute('href','/vocabulary/history');
  await userEvent.setup().click(screen.getByRole('button',{name:'New session'}));
  expect(await readyStart()).toBeInTheDocument();
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('/vocabulary/review');
});

test("dictation rows conceal answers and autoplay on start and row focus", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(await readyStart());
  expect(view.container.innerHTML).not.toContain("resilient");
  expect(view.container.innerHTML).not.toContain("sustainable");
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  await waitFor(() =>
    expect(player.play).toHaveBeenCalledWith(
      expect.objectContaining({ term: "resilient" }),
      expect.objectContaining({ accent: "uk" }),
    ),
  );
  await user.click(screen.getByRole("textbox", { name: "Answer 2" }));
  await waitFor(() =>
    expect(player.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ term: "sustainable" }),
      expect.anything(),
    ),
  );
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("submits the complete attempt once and retries the same frozen commit after save failure", async () => {
  const user = userEvent.setup();
  fb.current.persistVocabularySession
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  render(<MemoryRouter initialEntries={['/vocabulary/review']}><VocabularyPracticePage/><CurrentRoute/></MemoryRouter>);
  await user.click(await readyStart());
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient",
  );
  await user.type(screen.getByRole("textbox", { name: "Answer 2" }), "wrong");
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('resilient');
  expect(screen.getByRole('textbox', { name: 'Answer 2' })).toHaveValue('wrong');
  const [prepared, id] = fb.current.persistVocabularySession.mock.calls[0];
  expect(prepared.vocabularyReviews).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Retry submission" }));
  expect(fb.current.persistVocabularySession.mock.calls[1]).toEqual([
    prepared,
    id,
    { onError: expect.any(Function), onResult: expect.any(Function) },
  ]);
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.getByRole('heading', {name: '1 of 2 correct'})).toBeInTheDocument();
  await screen.findByText(`/vocabulary/history/${id}`);
  await user.click(screen.getByRole("button", { name: "Retry mistakes" }));
  expect(await screen.findAllByRole("textbox")).toHaveLength(1);
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "sustainable",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  await waitFor(() => expect(fb.current.persistVocabularySession).toHaveBeenCalledTimes(3));
  expect(fb.current.persistVocabularySession.mock.calls[2][1]).not.toEqual(id);
});

test('successful planned submission retains results while completed account state precedes history navigation', async () => {
  const entry = fb.current.state.vocabulary[0];
  const refs = [{ entryId: entry.id, senseId: entry.senses[0].id }];
  fb.current.state.plans = [{ id: 'transition-plan', kind: 'vocabulary', status: 'in_progress', startedAt: '2020-01-01', target: { type: 'vocabulary', mode: 'due-review', assessmentMode: 'definition', cards: refs } }];
  let refresh!: () => void;
  function AccountUpdates() {
    const [, setRevision] = useState(0);
    refresh = () => setRevision(value => value + 1);
    return <VocabularyPracticePage />;
  }
  let releaseHistory!: () => void;
  let historyReady = false;
  const historyPending = new Promise<void>(resolve => { releaseHistory = () => { historyReady = true; resolve(); }; });
  function DelayedHistory() {
    if (!historyReady) throw historyPending;
    return <VocabularyPracticePage />;
  }
  const frames: string[] = [];
  let recording = false;
  fb.current.persistVocabularySession.mockImplementation(async (prepared: any) => {
    fb.current.state = prepared;
    fb.current.stateRef.current = prepared;
    refresh();
    return true;
  });
  render(<MemoryRouter initialEntries={['/vocabulary/review?planId=transition-plan&returnTo=%2Ftoday%23task-transition-plan']}><Profiler id="submission-transition" onRender={() => { if (recording) frames.push(document.body.textContent || ''); }}><Suspense fallback={<p>Preparing saved results…</p>}><Routes><Route path="/vocabulary/review" element={<AccountUpdates />} /><Route path="/vocabulary/history/:sessionId" element={<DelayedHistory />} /></Routes><CurrentRoute /></Suspense></Profiler></MemoryRouter>);
  fireEvent.click(await readyStart());
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer 1' }), { target: { value: entry.term } });
  recording = true;
  fireEvent.click(screen.getByRole('button', { name: 'Submit session' }));
  expect(await screen.findByRole('heading', { name: '1 of 1 correct' })).toBeInTheDocument();
  // The context saves review rows first, then asynchronously completes the plan
  // in a fresh account-state clone while the history navigation can still wait.
  await act(async () => {
    const completed = structuredClone(fb.current.state);
    completeVocabularyPlan(completed, completed.vocabularySessions.at(-1));
    fb.current.state = completed;
    fb.current.stateRef.current = completed;
    refresh();
  });
  await waitFor(() => expect(fb.current.state.plans[0].status).toBe('completed'));
  await act(async () => {});
  expect(frames.some(frame => frame.includes('This planned task is no longer available'))).toBe(false);
  expect(screen.queryByRole('button', { name: 'Start session' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '1 of 1 correct' })).toBeInTheDocument();
  await act(async () => releaseHistory());
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '/today#task-transition-plan');
  expect(frames.some(frame => frame.includes('This planned task is no longer available'))).toBe(false);
});

test.each([
  ['definition', 'sense-0', true],
  ['dictation', 'sense-0', false],
  ['definition', 'another-sense', false],
])('successful results explain remaining mistake recovery only for their own mode and meaning (%s / %s)', async (mode,senseId,shown) => {
  fb.current.state.vocabularyStates=[{id:'recovering-state',entryId:'entry-0',senseId,cards:{},dimensions:Object.fromEntries(['meaning','listening','spelling','usage'].map(key=>[key,{successes:0,failures:0,partials:0}])),manualStatus:'new',reviewCount:1,wrong:{active:true,successesSinceFailure:1,modes:{[mode]:{active:true,successesSinceFailure:1}}}}];
  fb.current.state.vocabularySessions=[{id:'recovery-result',mode:'definition',status:'submitted',filter:{},preferences:{},entryIds:['entry-0'],startedAt:'2026-10-16',submittedAt:'2026-10-16',summary:{total:1,correct:1,incorrect:0,pending:0},results:[{cardId:'entry-0:sense-0:definition',entryId:'entry-0',senseId:'sense-0',term:'resilient',definition:'Definition 0',example:'A resilient community.',response:'resilient',expectedAnswer:'resilient',result:'success'}]}];
  render(<MemoryRouter initialEntries={['/vocabulary/review?sessionId=recovery-result']}><VocabularyPracticePage/></MemoryRouter>);
  await screen.findByRole('heading',{name:'1 of 1 correct'});
  const hint=screen.queryByText('1 word remains in mistake review.');
  if(shown) {
    expect(hint).toBeInTheDocument();
    expect(screen.getByText(/at least 24 hours between the first and last/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Open mistake review'})).toHaveAttribute('href','/vocabulary/review?wrongOnly=true&dueOnly=false&mode=definition');
  } else expect(hint).not.toBeInTheDocument();
});

test("keeps responses locally when exiting and resumes without persisting a review", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await readyStart());
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "my response",
  );
  await user.click(screen.getByRole("button", { name: "Exit session" }));
  await user.click(screen.getByRole("button", { name: "Keep progress" }));
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  await user.click(await screen.findByRole("button", { name: "Resume session" }));
  expect(screen.getByRole("textbox", { name: "Answer 1" })).toHaveValue(
    "my response",
  );
});

test("confirms unanswered cards before submitting and keeps production pending", async () => {
  const user = userEvent.setup();
  mount("?mode=production");
  await user.click(await readyStart());
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "A resilient community recovered.",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  expect(
    screen.getByRole("dialog", { name: "Submit incomplete session" }),
  ).toHaveTextContent("1 unanswered");
  await user.click(screen.getByRole("button", { name: "Submit anyway" }));
  expect(
    fb.current.persistVocabularySession.mock.calls[0][0].vocabularyReviews.map(
      (review: any) => review.result,
    ),
  ).toEqual(["pending", "failure"]);
  expect(await screen.findByText("Pending", { selector: "dt" })).toBeInTheDocument();
});

test("focus layout moves with Enter and stops playback on unmount", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = { layout: "cards" };
  const view = mount();
  await user.click(await readyStart());
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient{Enter}",
  );
  expect(screen.getByRole("textbox", { name: "Answer 2" })).toBeInTheDocument();
  view.unmount();
  expect(player.stop).toHaveBeenCalled();
});

test("central settings departure preserves an active session through the practice guard", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await readyStart());
  await user.click(screen.getByRole("button", { name: "Practice settings" }));
  expect(screen.getByRole('dialog',{name:'Exit practice session'})).toBeInTheDocument();
  expect(fb.current.saveVocabularyPreferences).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Cancel'}));
  expect(screen.getByRole('textbox',{name:'Answer 1'})).toBeInTheDocument();
});

test("clears the old owner session and cancels playback when the account changes", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(await readyStart());
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "old account response",
  );
  owner.current = "account-two";
  fb.current.state = { ...fb.current.state };
  view.rerender(
    <MemoryRouter>
      <VocabularyPracticePage />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Start session" }),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("fixtures create eligible cards for each objective review", () => {
  expect(
    getVocabularyReviewQueue(fb.current.state, { mode: "dictation" }),
  ).toHaveLength(2);
});

test("immediate feedback is local and locks an answer only after leaving the row", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = { feedback: "immediate" };
  mount();
  await user.click(await readyStart());
  await user.type(screen.getByRole("textbox", { name: "Answer 1" }), "wrong");
  expect(screen.queryByText("Incorrect")).not.toBeInTheDocument();
  await user.click(screen.getByRole("textbox", { name: "Answer 2" }));
  expect(screen.getByText("Incorrect")).toBeInTheDocument();
  expect(
    screen.getByText("resilient", { selector: "strong" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Answer 1" })).toHaveAttribute(
    "readonly",
  );
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("audio loop records listened words in one batch without mastery reviews", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = {
    audioGapMs: 0,
    audioExamples: false,
  };
  mount("?mode=audio");
  await user.click(await readyStart());
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Audio loop complete"),
  );
  expect(player.play).toHaveBeenCalledTimes(2);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
  const submitted = fb.current.persistVocabularySession.mock.calls[0][0];
  expect(submitted.vocabularyActivities).toHaveLength(2);
  expect(submitted.vocabularyReviews).toHaveLength(0);
  expect(submitted.vocabularySessions[0].summary.listened).toBe(2);
});

test("dictation deduplicates senses and follows the frozen snapshot order", async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary[0].senses.push({
    ...fb.current.state.vocabulary[0].senses[0],
    id: "second-sense",
  });
  fb.current.state.settings.vocabulary = { order: "random" };
  const view = mount();
  await user.click(await readyStart());
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  const stored = {session:await savedDraft()};
  const firstEntry = fb.current.state.vocabulary.find(
    (entry: any) => entry.id === stored.session.cardIds[0].entryId,
  );
  await waitFor(() =>
    expect(player.play).toHaveBeenCalledWith(
      expect.objectContaining({ term: firstEntry.term }),
      expect.anything(),
    ),
  );
  fb.current.state = { ...fb.current.state, vocabulary: [] };
  view.rerender(
    <MemoryRouter>
      <VocabularyPracticePage />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
});

test("blocked automatic audio asks for a gesture and manual replay recovers", async () => {
  const user = userEvent.setup();
  player.play
    .mockResolvedValueOnce({ ok: false, source: "none", reason: "blocked" })
    .mockResolvedValue({ ok: true, source: "speech", accent: "uk", voice: "Test UK voice" });
  mount();
  await user.click(await readyStart());
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Select Play to enable audio",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Replay current word" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("UK synthetic voice · Test UK voice"),
  );
});

test("a failed submission stays frozen after local recovery and keeps the same timestamp", async () => {
  const user = userEvent.setup();
  fb.current.persistVocabularySession
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const view = mount();
  await user.click(await readyStart());
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Answer 2" }),
    "sustainable",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  await screen.findByRole('alert');
  const timestamp =
    fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0]
      .submittedAt;
  view.unmount();
  mount();
  await user.click(await screen.findByRole("button", { name: "Resume session" }));
  expect(screen.getByRole("textbox", { name: "Answer 1" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry submission" }));
  expect(
    fb.current.persistVocabularySession.mock.calls[1][0].vocabularySessions[0]
      .submittedAt,
  ).toEqual(timestamp);
});

test("pausing an audio loop cancels the between-word delay", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = {
    audioGapMs: 5000,
    audioExamples: false,
  };
  const clearTimer = vi.spyOn(window, "clearTimeout");
  mount("?mode=audio");
  await user.click(await readyStart());
  await waitFor(() =>
    expect(screen.getByText("1 / 2 listened")).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Pause loop" }));
  expect(clearTimer).toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Audio paused");
  expect(player.play).toHaveBeenCalledTimes(1);
  clearTimer.mockRestore();
});

test("audio sessions respect disabled autoplay and allow manual loop playback", async () => {
  fb.current.state.settings.vocabulary = { autoPlay: false, audioGapMs: 0, audioExamples: false };
  const user = userEvent.setup();
  mount("?mode=audio");
  await user.click(await readyStart());
  expect(player.play).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Play loop" }));
  await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
});

test.each(["definition", "cloze"])(
  "%s uses its own prompt and waits for submission to reveal the word",
  async (reviewMode) => {
    const user = userEvent.setup();
    mount(`?mode=${reviewMode}`);
    await user.click(await readyStart());
    if (reviewMode === "definition")
      expect(screen.getByText("Definition 0")).toBeInTheDocument();
    else expect(screen.getAllByText("A _____ community.")).toHaveLength(2);
    expect(screen.queryByText("resilient")).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Answer 1" }),
      "resilient",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Answer 2" }),
      "sustainable",
    );
    await user.click(screen.getByRole("button", { name: "Submit session" }));
    await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
    expect(
      fb.current.persistVocabularySession.mock.calls[0][0].vocabularyReviews.every(
        (review: any) =>
          review.result === "success" && review.mode === reviewMode,
      ),
    ).toBe(true);
  },
);

test("authored distinction choices grade the selected answer and show it in the results", async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary[0].senses[0].distinctionTask = {
    prompt: "Which means able to recover?",
    options: ["fragile", "robust"],
    answer: "robust",
    explanation: "Robust things resist damage.",
  };
  mount("?mode=distinction");
  await user.click(await readyStart());
  await user.click(screen.getByRole("radio", { name: "robust" }));
  expect(screen.queryByText("Correct")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  const record =
    fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0];
  expect(record.results[0]).toEqual(
    expect.objectContaining({
      expectedAnswer: "robust",
      response: "robust",
      result: "success",
    }),
  );
  expect(await screen.findByRole("table")).toHaveTextContent("robust");
});

test("recent history opens a result log without starting a completed attempt", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(await readyStart());
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Answer 2" }),
    "sustainable",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
  const persisted = fb.current.persistVocabularySession.mock.calls[0][0];
  fb.current.state = persisted;
  view.unmount();
  mount();
  expect(
    screen.queryByRole("button", { name: "Resume session" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Dictation.*2 words.*2 correct/ }),
  );
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  const detail = screen.getAllByRole('link', { name: /Details/ })[0];
  const href = detail.getAttribute('href')!;
  const returnTo = new URL(href, 'https://fieldbook.test').searchParams.get('returnTo')!;
  expect(returnTo).toContain(`sessionId=${persisted.vocabularySessions[0].id}`);
  cleanup();
  mount(returnTo.slice(returnTo.indexOf('?')) + '&resultFilter=flagged');
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.getByText('No results in this view.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'New session' }));
  expect(await screen.findByRole('button',{name:'Start session'})).toBeDisabled();
  expect(screen.getByText('No words match these filters.')).toBeInTheDocument();
});

function CurrentRoute(){return <output>{useLocation().pathname}</output>}
test('result detail links retain the session and filtered source without nesting previous attempts', async () => {
  const source = '/vocabulary/words?search=community&page=2';
  const oldSession = '/vocabulary/history/old?sessionId=old&returnTo=' + encodeURIComponent(source);
  const detail = '/vocabulary/entry/entry-0?senseId=sense-0&returnTo=' + encodeURIComponent(oldSession);
  mount('?entryId=entry-0&senseId=sense-0&dueOnly=false&returnTo=' + encodeURIComponent(detail));
  const user = userEvent.setup();
  await user.click(await readyStart());
  await user.type(screen.getByRole('textbox', { name: 'Answer 1' }), 'resilient');
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  const link = await screen.findByRole('link', { name: 'Details' });
  const entry = new URL(link.getAttribute('href')!, 'https://fieldbook.test');
  const result = new URL(entry.searchParams.get('returnTo')!, 'https://fieldbook.test');
  expect(result.pathname).toContain('/vocabulary/history/');
  expect(result.searchParams.get('sessionId')).not.toBe('old');
  expect(result.searchParams.get('returnTo')).toBe(source);
});
function ImperativeNavigation() {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  return <>
    <button onClick={() => navigateWithPracticeGuard('/account', () => navigate('/account'))}>Account menu route</button>
    <button onClick={() => navigateWithPracticeGuard('/write', () => { fb.current.setSkill('writing', '/write'); navigate('/write'); })}>Command search route</button>
    <button onClick={() => setMoreOpen(true)}>Open More</button>
    {moreOpen ? <div role="dialog" aria-label="More navigation"><button onClick={() => { setMoreOpen(false); navigateWithPracticeGuard('/progress', () => navigate('/progress')); }}>Progress from More</button></div> : null}
  </>;
}
test('imperative account and command navigation wait for the active session decision', async () => {
  const user = userEvent.setup();
  fb.current.setSkill = vi.fn();
  render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><ImperativeNavigation /><VocabularyPracticePage /><CurrentRoute /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(await readyStart());
  await user.click(screen.getByRole('button', { name: 'Account menu route' }));
  expect(screen.getByText('/vocabulary/review')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Command search route' }));
  expect(fb.current.setSkill).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  expect(fb.current.setSkill).toHaveBeenCalledWith('writing', '/write');
  expect(await screen.findByText('/write')).toBeInTheDocument();
});

test('More closes before the practice departure decision', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><ImperativeNavigation /><VocabularyPracticePage /><CurrentRoute /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(await readyStart());
  await user.click(screen.getByRole('button', { name: 'Open More' }));
  await user.click(screen.getByRole('button', { name: 'Progress from More' }));
  expect(screen.queryByRole('dialog', { name: 'More navigation' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Exit practice session' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  expect(await screen.findByText('/progress')).toBeInTheDocument();
});
test('active internal navigation lets learners cancel or keep their draft before departure',async()=>{
const user=userEvent.setup();render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><Link to='/vocabulary/words'>Leave for words</Link><VocabularyPracticePage/><CurrentRoute/></MemoryRouter>);
await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());await user.click(await readyStart());
await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'my answer');await user.click(screen.getByRole('link',{name:'Leave for words'}));
expect(screen.getByRole('dialog',{name:'Exit practice session'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByText('/vocabulary/review')).toBeInTheDocument();
await user.click(screen.getByRole('link',{name:'Leave for words'}));await user.click(screen.getByRole('button',{name:'Keep progress'}));expect(await screen.findByText('/vocabulary/words')).toBeInTheDocument();expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('submitted group stays on history across refresh and word-detail return',async()=>{
const user=userEvent.setup();groupFixture(2);fb.current.state.settings={vocabulary:{mode:'production'}};
const view=render(<MemoryRouter initialEntries={['/vocabulary/study?bookId=test-book&unitId=test-group&dueOnly=false']}><Routes><Route path='/vocabulary/study' element={<VocabularyPracticePage/>}/><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes><CurrentRoute/></MemoryRouter>);
await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());expect(screen.getByRole('button',{name:'Practice mode'})).toHaveTextContent('Dictation');await user.click(await readyStart());await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'word0');await user.type(screen.getByRole('textbox',{name:'Answer 2'}),'word1');await user.click(screen.getByRole('button',{name:'Submit session'}));
await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());const state=fb.current.persistVocabularySession.mock.calls[0][0];const id=state.vocabularySessions[0].id;expect(await screen.findByRole('table')).toBeInTheDocument();expect(await screen.findByText(`/vocabulary/history/${id}`)).toBeInTheDocument();
const returnTo=new URL(screen.getAllByRole('link',{name:/Details/})[0].getAttribute('href')!,'https://test.test').searchParams.get('returnTo')!;expect(returnTo).toContain(`/vocabulary/history/${id}`);expect(returnTo).toContain('bookId=test-book');view.unmount();fb.current.state=state;
render(<MemoryRouter initialEntries={[returnTo]}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes><CurrentRoute/></MemoryRouter>);expect(await screen.findByRole('table')).toBeInTheDocument();expect(await screen.findByText(`/vocabulary/history/${id}`)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Start session'})).not.toBeInTheDocument();
});

test('mobile More dialog links still protect an active vocabulary draft',async()=>{
const user=userEvent.setup();render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><div role='dialog' aria-label='More navigation'><Link to='/vocabulary/words'>My words from More</Link></div><VocabularyPracticePage/><CurrentRoute/></MemoryRouter>);
await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());await user.click(await readyStart());await user.click(screen.getByRole('link',{name:'My words from More'}));expect(screen.getByRole('dialog',{name:'Exit practice session'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByText('/vocabulary/review')).toBeInTheDocument();
});

test('legacy identity-only distinction draft keeps the old accepted synonym', async () => {
 const user=userEvent.setup();const entry=fb.current.state.vocabulary[0];
 entry.term='affect';entry.senses[0].synonyms=['influence'];entry.senses[0].distinctions=['Affect is a verb.'];
 const now=new Date().toISOString();
 localStorage.setItem('fieldbook-vocabulary-draft-v1:account-one',JSON.stringify({version:1,savedAt:now,session:{id:'legacy-distinction',mode:'distinction',status:'paused',startedAt:now,index:0,preferences:{},filter:{},cardIds:[{id:`${entry.id}:${entry.senses[0].id}:distinction`,entryId:entry.id,senseId:entry.senses[0].id,mode:'distinction'}],answers:{}}}));
 mount('?mode=distinction');await user.click(await screen.findByRole('button',{name:'Resume session'}));
 await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'influence');
 await user.click(screen.getByRole('button',{name:'Submit session'}));
 await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
 expect(fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0].results[0].result).toBe('success');
});


test('explicit unlearned catalog drill keeps its group sense and makes no preparation writes', async()=>{
  const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));Object.assign(VOCABULARY_CATALOG,released);
  const raw=released.entries.find((entry:any)=>entry.term==='core');fb.current.state.vocabulary=[];fb.current.state.vocabularyEvidence=[];fb.current.loadVocabularyCatalog=vi.fn(async()=>true);
  const before=JSON.stringify(fb.current.state);const view=mount(`?entryId=${raw.id}&senseId=editorial%3Acore%3Afruit-centre&bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02&dueOnly=false&returnTo=%2Fvocabulary%2Fentry%2F${raw.id}`);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());expect(screen.getByText(/containing its seeds/)).toBeInTheDocument();
  await userEvent.setup().click(await readyStart());expect(screen.getAllByRole('textbox')).toHaveLength(1);
  const draft=(await savedDraft());expect(draft.cardSnapshots[0].context).toMatchObject({bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02',senseId:'editorial:core:fruit-centre'});expect(draft.cardSnapshots[0].entry.senses[0].definition).toContain('seeds');expect(JSON.stringify(fb.current.state)).toBe(before);expect(fb.current.persistNow).not.toHaveBeenCalled();expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();view.unmount();
  mount('?dueOnly=false');expect(await screen.findByText('No words match these filters.')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Start session'})).toBeDisabled();
});

test('direct historical route loads the frozen session source book without a book query', async()=>{
  fb.current.loadVocabularyCatalog=vi.fn(async()=>true);fb.current.state.vocabularySessions=[{id:'history-book',mode:'dictation',status:'submitted',filter:{},selection:{kind:'unit',bookId:'source-book',unitId:'source-group'},preferences:{},results:[{cardId:'historic-card',entryId:'historic-word',senseId:'historic-sense',term:'peel',response:'peal',expectedAnswer:'peel',definition:'Old meaning.',example:'',result:'failure'}],entryIds:['historic-word'],summary:{total:1,correct:0,incorrect:1,pending:0},submittedAt:'2025-01-01',startedAt:'2025-01-01'}];
  render(<MemoryRouter initialEntries={['/vocabulary/history/history-book']}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes></MemoryRouter>);
  expect(await screen.findByRole('table')).toBeInTheDocument();await waitFor(()=>expect(fb.current.loadVocabularyCatalog).toHaveBeenCalledWith('source-book', {unitId:'source-group',entryIds:['historic-word']}));expect(screen.getByRole('button',{name:'Play UK pronunciation of peel'})).toBeInTheDocument();expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test.each([false, true])('historical food core retry retains changed-sense dictation with mixed failures=%s', async mixed => {
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  Object.assign(VOCABULARY_CATALOG, released);
  const raw = released.entries.find((entry: any) => entry.term === 'core');
  const old = {cardId:'ve-7c70dbbe:kaikki:846f18ca02f7f1d01c:dictation',entryId:raw.id,senseId:'kaikki:846f18ca02f7f1d01c',term:'core',expectedAnswer:'core',response:'cor',result:'failure',definition:'Old core definition.',example:''};
  const rows = mixed ? [old, {cardId:'entry-0:sense-0:dictation',entryId:'entry-0',senseId:'sense-0',term:'resilient',expectedAnswer:'resilient',response:'wrong',result:'failure',definition:'Definition 0',example:'A resilient community.'}] : [old];
  // A legacy record can refer to public words absent from the learner's active list.
  fb.current.state.vocabularySessions = [{id:'legacy-food',mode:'dictation',status:'submitted',selection:{kind:'unit',bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'},filter:{},preferences:{order:'source'},results:rows,entryIds:rows.map(row=>row.entryId),summary:{total:rows.length,correct:0,incorrect:rows.length,pending:0},startedAt:'2025-01-01',submittedAt:'2025-01-01'}];
  if (mixed) fb.current.state.vocabulary[0].sources.push({type:'wordbook',id:'old-food-member',bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'});
  fb.current.loadVocabularyCatalog = vi.fn(async()=>true);
  const before = JSON.stringify(fb.current.state);
  render(<MemoryRouter initialEntries={['/vocabulary/history/legacy-food']}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes></MemoryRouter>);
  await userEvent.setup().click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getAllByRole('textbox')).toHaveLength(rows.length);
  const draft = (await savedDraft());
  expect(draft.cardIds).toContainEqual({id:'ve-7c70dbbe:editorial:core:fruit-centre:dictation',entryId:'ve-7c70dbbe',senseId:'editorial:core:fruit-centre',mode:'dictation'});
  expect(JSON.stringify(fb.current.state)).toBe(before);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical retry uses the frozen non-dictation task and preserves stored history', async () => {
  const card = getVocabularyReviewQueue(fb.current.state, {mode:'definition',dueOnly:false})[0];
  card.task = {prompt:'Original money meaning.',acceptedAnswers:['original-answer'],explanation:'Original explanation.'};
  const frozen = createVocabularySession([card], 'definition', {order:'source'});
  const row = evaluateVocabularySessionAnswer(card, 'wrong');
  const record = {...frozen,status:'submitted',results:[row],entryIds:[card.entryId],reviewIds:[],summary:{total:1,correct:0,incorrect:1,pending:0},submittedAt:'2025-01-01'};
  fb.current.state.vocabularySessions = [record];
  fb.current.state.vocabulary[0].senses[0].definition = 'Current different sense meaning.';
  const before = JSON.stringify(fb.current.state);
  mount(`?sessionId=${record.id}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByText('Original money meaning.')).toBeInTheDocument();
  await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'original-answer');
  await user.click(screen.getByRole('button',{name:'Submit session'}));
  await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
  const submitted = fb.current.persistVocabularySession.mock.calls[0][0];
  expect(submitted.vocabularySessions[1].results[0]).toMatchObject({result:'success',senseId:card.senseId,expectedAnswer:'original-answer',prompt:'Original money meaning.'});
  expect(submitted.vocabularySessions[0]).toEqual(record);
  expect(JSON.stringify(fb.current.state)).toBe(before);
});

test('historical retry visibly blocks unavailable tasks instead of silently retrying a subset', async () => {
  const card = getVocabularyReviewQueue(fb.current.state,{mode:'definition',dueOnly:false})[0];
  const row = evaluateVocabularySessionAnswer(card,'wrong');
  fb.current.state.vocabularySessions = [{id:'unavailable-retry',mode:'definition',status:'submitted',filter:{},preferences:{},results:[row,{...row,cardId:'removed:lost:synonym',entryId:'removed',senseId:'lost',term:'lost word'}],entryIds:[card.entryId,'removed'],summary:{total:2,correct:0,incorrect:2,pending:0},startedAt:'2025-01-01',submittedAt:'2025-01-01'}];
  const before = JSON.stringify(fb.current.state);
  mount('?sessionId=unavailable-retry');
  await userEvent.setup().click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByRole('alert')).toHaveTextContent(/unavailable.*lost word/i);
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(JSON.stringify(fb.current.state)).toBe(before);
});

function delayedHistoryFixture() {
  const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
  const raw=released.entries.find((entry:any)=>entry.term==='core');
  const row={cardId:'ve-7c70dbbe:kaikki:846f18ca02f7f1d01c:dictation',entryId:raw.id,senseId:'kaikki:846f18ca02f7f1d01c',term:'core',expectedAnswer:'core',response:'cor',result:'failure',definition:'Old core definition.',example:''};
  fb.current.state.vocabularySessions=[{id:'delayed-history',mode:'dictation',status:'submitted',selection:{kind:'unit',bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'},filter:{},preferences:{},results:[row],entryIds:[raw.id],summary:{total:1,correct:0,incorrect:1,pending:0},startedAt:'2025-01-01',submittedAt:'2025-01-01'}];
  VOCABULARY_CATALOG.entries=originalCatalog.entries.filter(entry=>entry.id!==raw.id);
  VOCABULARY_CATALOG.memberships=originalCatalog.memberships.filter(member=>member.entryId!==raw.id);
  let complete!:()=>void;
  let fail!:(error:Error)=>void;
  const pending=new Promise<void>((resolve,reject)=>{complete=()=>{Object.assign(VOCABULARY_CATALOG,released);resolve();};fail=reject;});
  fb.current.loadVocabularyCatalog=vi.fn((book?:string)=>book==='ielts-vocabulary'?pending:Promise.resolve());
  return {complete,fail,before:JSON.stringify(fb.current.state)};
}

test('historical retry waits for delayed source catalog and prevents duplicate retry clicks',async()=>{
  const {complete,before}=delayedHistoryFixture();
  mount('?sessionId=delayed-history');
  const button=await screen.findByRole('button',{name:'Retry mistakes'});
  fireEvent.click(button);fireEvent.click(button);
  expect(screen.getByRole('button',{name:/Preparing retry/i})).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(fb.current.loadVocabularyCatalog.mock.calls.filter(([book]:[string])=>book==='ielts-vocabulary')).toHaveLength(2); // one background load, one guarded retry wait
  await act(async()=>complete());
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toBeInTheDocument();
  expect(JSON.stringify(fb.current.state)).toBe(before);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical retry load failure keeps results and supports a successful second click',async()=>{
  const {complete,fail,before}=delayedHistoryFixture();
  mount('?sessionId=delayed-history');
  fireEvent.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  await act(async()=>fail(new Error('Offline')));
  expect(await screen.findByRole('alert')).toHaveTextContent(/wordbook.*could not be loaded/i);
  expect(screen.getByRole('button',{name:'Retry mistakes'})).toBeEnabled();
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  fb.current.loadVocabularyCatalog.mockImplementation(async()=>complete());
  await userEvent.setup().click(screen.getByRole('button',{name:'Retry mistakes'}));
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toBeInTheDocument();
  expect(JSON.stringify(fb.current.state)).toBe(before);
});

test('historical retry ignores a delayed catalog completion after account changes',async()=>{
  const {complete}=delayedHistoryFixture();
  const view=mount('?sessionId=delayed-history');
  fireEvent.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByRole('button',{name:/Preparing retry/i})).toBeDisabled();
  owner.current='account-two';
  fb.current.state={...fb.current.state,vocabularySessions:[]};fb.current.stateRef.current=fb.current.state;
  view.rerender(<MemoryRouter><VocabularyPracticePage/></MemoryRouter>);
  await act(async()=>complete());
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-two')).toBeNull();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical retry does not start after leaving the results while the catalog loads',async()=>{
  const {complete}=delayedHistoryFixture();
  mount('?sessionId=delayed-history');
  fireEvent.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByRole('button',{name:/Preparing retry/i})).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button',{name:'New session'}));
  await act(async()=>complete());
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('planned review resolves account targets despite untrusted URL filters and multiple meanings', async()=>{
  const entry=fb.current.state.vocabulary[0];
  entry.senses.push({...entry.senses[0],id:'second-meaning',definition:'Another meaning'});
  const refs=[{entryId:entry.id,senseId:'second-meaning'},{entryId:entry.id,senseId:entry.senses[0].id}];
  fb.current.state.plans=[{id:'account-plan',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',cards:refs}}];
  fb.current.state.settings.vocabulary={sessionSize:5,order:'random',autoPlay:false};
  fb.current.loadVocabularyCatalog=vi.fn(async()=>true);
  mount(`?planId=account-plan&mode=definition&entryId=entry-1&dueOnly=true&wrongOnly=true&batchCards=${encodeURIComponent(JSON.stringify([{entryId:'entry-1',senseId:'sense-1'}]))}`);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  await waitFor(async()=>expect((await latestDraft())).toMatchObject({planId:'account-plan',mode:'dictation',selection:{kind:'planned-review',planId:'account-plan',cards:refs}}));
  await waitFor(async()=>expect((await latestDraft())?.cardIds.map(({entryId,senseId})=>({entryId,senseId}))).toEqual(refs));
  expect(fb.current.loadVocabularyCatalog).toHaveBeenCalledWith(undefined,expect.objectContaining({entryIds:[entry.id]}));
});

test('unknown planned reviews remain unavailable instead of starting free practice',async()=>{
  fb.current.state.vocabulary[0].senses[0].example = '';
  mount('?planId=missing&dueOnly=false&entryId=entry-0&senseId=sense-0&mode=cloze');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeDisabled());
  expect(screen.getByText(/planned task is no longer available/i)).toBeInTheDocument();
  expect(screen.queryByText('No words match these filters.')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Explore wordbooks' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Try / })).not.toBeInTheDocument();
});

test.each(['/planning?week=next#task-exact-plan', '/today?scenario=return#task-exact-plan'])('planned review results keep each dictation sense and one exact source return through recovery (%s)',async source=>{
  const entry=fb.current.state.vocabulary[0];entry.senses.push({...entry.senses[0],id:'second-meaning',definition:'Another meaning'});
  const refs=entry.senses.map((sense:{id:string})=>({entryId:entry.id,senseId:sense.id}));
  fb.current.state.plans=[{id:'exact-plan',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',cards:refs}}];
  const view=mount(`?planId=exact-plan&returnTo=${encodeURIComponent(source)}`);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  await waitFor(async()=>expect((await latestDraft())?.returnTo).toBe(source));
  view.unmount();
  mount('?resume=true');
  fireEvent.click(await screen.findByRole('button',{name:'Resume session'}));
  await screen.findByRole('textbox',{name:'Answer 1'});
  for(const input of screen.getAllByRole('textbox'))fireEvent.change(input,{target:{value:entry.term}});
  fireEvent.click(screen.getByRole('button',{name:'Submit session'}));
  await screen.findByRole('button',{name:'New session'});
  const links=screen.getAllByRole('link',{name:'Details'});
  expect(links.map(link=>new URL(link.getAttribute('href')!,'http://local').searchParams.get('senseId'))).toEqual(refs.map((ref:{senseId:string})=>ref.senseId));
  const label = source.startsWith('/today') ? 'Back to Today' : 'Back to Planning';
  expect(screen.getAllByRole('link',{name:label})).toHaveLength(1);
  expect(screen.getByRole('link',{name:label})).toHaveAttribute('href',source);
});

test('a skipped no-longer-due task explains why it cannot start',async()=>{
  fb.current.state.plans=[{id:'empty-slot',kind:'vocabulary',status:'skipped',skipReason:'no-longer-due',target:{type:'vocabulary',mode:'due-review',binding:'frozen',assessmentMode:'definition',cards:[]}}];
  mount('?planId=empty-slot');
  expect(await screen.findByText(/no longer due/i)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Start session'})).toBeDisabled();
});

test('planned review resource failures retry without falling back to a free session',async()=>{
  const entry=fb.current.state.vocabulary[0];
  fb.current.state.plans=[{id:'retry-plan',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]}}];
  fb.current.loadVocabularyCatalog=vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(true);
  mount('?planId=retry-plan');
  const retry=await screen.findByRole('button',{name:'Retry catalog'});
  expect(screen.getByRole('button',{name:'Start session'})).toBeDisabled();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  await waitFor(async()=>expect((await latestDraft())?.selection).toMatchObject({kind:'planned-review',planId:'retry-plan'}));
});

test('planned review ignores legacy group-study query detection',async()=>{
  const entry=fb.current.state.vocabulary[0];
  fb.current.state.plans=[{id:'review-route',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]}}];
  mount('?planId=review-route&bookId=unknown&unitId=unknown&dueOnly=false');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  await waitFor(async()=>expect((await latestDraft())?.selection).toMatchObject({kind:'planned-review',planId:'review-route'}));
});
