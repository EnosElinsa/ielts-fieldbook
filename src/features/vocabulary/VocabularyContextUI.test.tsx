import {
  cleanup,
  act,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { VocabularyGroupWordsPage } from "./VocabularyGroupWordsPage";
import { VocabularyEntryPage } from "./VocabularyEntryPage";
import { VocabularyPracticeResults } from "./VocabularyPracticeResults";
import { VocabularyNavigation } from "./VocabularyPages";
import { resetDictionaryCache } from "./DictionarySenses";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { resolveVocabularyLearningContext } from "../../domain/vocabulary/context";
import { normalizeVocabularyPreferences } from "../../domain/vocabulary/preferences";
import { registerVocabularyTeaching, vocabularyTeaching } from '../../domain/vocabulary/runtimeData';
import { resetAccountIdentity, setAccountIdentity } from '../../storage/accountIdentity';
const mocks = vi.hoisted(() => ({
  fb: null as any,
  player: { play: vi.fn(), stop: vi.fn() },
}));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => mocks.fb,
}));
vi.mock("./playback", () => ({ createVocabularyPlayback: () => mocks.player }));
vi.mock("../../domain/vocabulary/media", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  getVocabularyMedia: vi.fn(async () => ({
    recordings: [
      {
        url: "https://example.test/core.ogg",
        title: "Core recording",
        accent: "us",
        status: "verified",
        availability: "http-audio",
        wordformConfirmed: true,
        sourceUrl: "https://example.test/recording",
        author: "Recording author",
        license: "CC-BY-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        changes: "No edits.",
      },
    ],
  })),
}));
const original = structuredClone(VOCABULARY_CATALOG);
const release = JSON.parse(
  readFileSync("public/vocabulary-catalog.json", "utf8"),
);
beforeEach(() => {
  Object.assign(VOCABULARY_CATALOG, structuredClone(release));
  const state = {
    vocabulary: [],
    vocabularyStates: [],
    vocabularyReviews: [],
    vocabularyEvidence: [],
    vocabularyActivities: [],
    vocabularySessions: [],
    vocabularyImportBatches: [],
    wordbookEnrollments: [],
    wordbookProgress: [],
    settings: {},
  };
  mocks.fb = {
    state,
    stateRef: { current: state },
    loadVocabularyCatalog: vi.fn(async () => true),
    persistNow: vi.fn(),
    toast: vi.fn(),
    openModal: vi.fn(),
  };
  mocks.player.play.mockReset().mockResolvedValue({
    ok: true,
    source: "speech",
    accent: "uk",
    voice: "Test UK voice",
  });
  mocks.player.stop.mockReset();
  resetDictionaryCache();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ entries: [] }) })),
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  resetAccountIdentity();
  Object.assign(VOCABULARY_CATALOG, structuredClone(original));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname + location.search}
    </output>
  );
}
function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/vocabulary/wordbooks/:bookId/groups/:unitId/words"
          element={<VocabularyGroupWordsPage />}
        />
        <Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} />
        <Route path="/vocabulary/review" element={<p>Practice setup</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}
const book = "ielts-vocabulary";
const core = () => release.entries.find((entry: any) => entry.term === "core");

test('personal notes on a saved additional dictionary meaning remain visible when the small catalogue omits that meaning',async()=>{
 const source=release.entries.find((entry:any)=>entry.term==='skill');
 const row=vocabularyTeaching.readiness.corrections.find(item=>item.entryId===source.id&&item.definition?.startsWith('In AI,'))!;
 expect(source.senses.some((sense:any)=>sense.id===row.senseId)).toBe(false);
 const personal={...structuredClone(row.originalSense),definition:row.definition,example:row.example,distinctions:['Personal bibliography advice from a tutor.']};
 mocks.fb.state.vocabulary=[{...structuredClone(source),senses:[personal]}];
 const before=structuredClone(mocks.fb.state);
 mount(`/vocabulary/entry/${source.id}?senseId=${encodeURIComponent(row.senseId)}`);
 await userEvent.click(await screen.findByText('Meaning source',{exact:true}));
 expect(await screen.findByText('Your saved meaning and notes.')).toBeVisible();
 await userEvent.click(await screen.findByText('Your other learning notes',{exact:true}));
 expect(screen.getByText(personal.distinctions[0])).toBeVisible();
 expect(mocks.fb.state).toEqual(before);expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('next practice preserves the selected group meaning and return destination without recording evidence', async () => {
  const raw=core(),unitId='ielts-vocabulary-chapter-12-group-02';
  const origin=`/vocabulary/entry/${raw.id}?bookId=${book}&unitId=${unitId}&returnTo=%2Fvocabulary%3Fsearch%3Dcore`;
  const before=JSON.stringify(mocks.fb.state);
  mount(origin);
  const panel=await screen.findByRole('region',{name:'Next practice'});
  const link=within(panel).getByRole('link',{name:'Practise Meaning recall'});
  const next=new URL(link.getAttribute('href')!,'https://test.test');
  expect(next.searchParams.get('senseId')).toBe('editorial:core:fruit-centre');
  expect(next.searchParams.get('bookId')).toBe(book);
  expect(next.searchParams.get('unitId')).toBe(unitId);
  expect(next.searchParams.get('returnTo')).toBe(origin);
  expect(next.searchParams.get('mode')).toBe('definition');
  expect(panel).toHaveTextContent('No verified meaning retrieval for this meaning yet.');
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('next practice waits for teaching before displaying a recommendation',async()=>{
  let finish!:()=>void;
  mocks.fb.loadVocabularyCatalog.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  mount(`/vocabulary/entry/${core().id}`);
  expect(screen.queryByRole('region',{name:'Next practice'})).not.toBeInTheDocument();
  await act(async()=>finish());
  expect(await screen.findByRole('region',{name:'Next practice'})).toBeInTheDocument();
});

test('next practice saves only the explicitly requested dictionary meaning and opens its recommended mode',async()=>{
  linkedDictionary();mocks.fb.persistNow.mockResolvedValue(true);
  mount(`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`);
  const panel=await screen.findByRole('region',{name:'Next practice'});
  await userEvent.click(within(panel).getByRole('button',{name:'Practise Meaning recall'}));
  expect(await screen.findByText('Practice setup')).toBeInTheDocument();
  const route=new URL(screen.getByLabelText('Current route').textContent!,'https://test.test');
  expect(route.searchParams.get('senseId')).toBe(linkedMeaning.id);
  expect(route.searchParams.get('mode')).toBe('definition');
  const draft=mocks.fb.persistNow.mock.calls[0][0];
  expect(draft.vocabulary).toHaveLength(1);
  expect(draft.vocabulary[0].senses).toHaveLength(1);
  expect(draft.vocabulary[0].senses[0].id).toBe(linkedMeaning.id);
  expect(draft.vocabularyEvidence).toEqual([]);
});

test('next practice becomes due while the details page stays open',async()=>{
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
    const due='2026-10-17T10:01:00.000Z',sense={id:'clock-sense',pos:'noun',definition:'A classroom term.',example:'We practise clockword in class.',source:'Personal note'};
    const entry={id:'clock-entry',term:'clockword',category:'word',meaning:sense.definition,example:sense.example,senses:[sense],tags:[],sources:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
    mocks.fb.state.vocabulary=[entry];
    mocks.fb.state.vocabularyStates=[{id:'clock-state',entryId:entry.id,senseId:sense.id,dimensions:{},cards:Object.fromEntries(['dictation','definition','cloze','production'].map(mode=>[mode,{due}])),wrong:{active:false,modes:{}},reviewCount:0}];
    await act(async()=>{mount('/vocabulary/entry/'+entry.id+'?senseId='+sense.id);});
    expect(screen.getByRole('region',{name:'Next practice'})).toHaveTextContent('Your next review is scheduled for');
    await act(async()=>{vi.advanceTimersByTime(60050);});
    expect(screen.getByRole('region',{name:'Next practice'})).toHaveTextContent('This exercise is due for this meaning.');
    expect(screen.getByRole('link',{name:'Practise Meaning recall'})).toBeInTheDocument();
    expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  } finally {vi.useRealTimers();}
});

test('next practice updates a new-skill suggestion when a different mode becomes due',async()=>{
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
    const due='2026-10-17T10:01:00.000Z',sense={id:'clock-sense',pos:'noun',definition:'A classroom term.',example:'We practise clockword in class.',source:'Personal note'};
    const entry={id:'clock-entry',term:'clockword',category:'word',meaning:sense.definition,example:sense.example,senses:[sense],tags:[],sources:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
    mocks.fb.state.vocabulary=[entry];
    mocks.fb.state.vocabularyStates=[{id:'clock-state',entryId:entry.id,senseId:sense.id,dimensions:{},cards:{definition:{due}},wrong:{active:false,modes:{}},reviewCount:0}];
    mocks.fb.state.vocabularyEvidence=[{entryId:entry.id,senseId:sense.id,dimension:'meaning',mode:'definition',result:'success',verification:'objective',occurredAt:'2026-10-15T10:00:00Z',sourceType:'personal',sourceId:'clock-lesson'}];
    await act(async()=>{mount('/vocabulary/entry/'+entry.id+'?senseId='+sense.id);});
    expect(screen.getByRole('link',{name:'Practise Dictation'})).toBeInTheDocument();
    await act(async()=>{vi.advanceTimersByTime(60050);});
    expect(screen.getByRole('region',{name:'Next practice'})).toHaveTextContent('This exercise is due for this meaning.');
    expect(screen.getByRole('link',{name:'Practise Meaning recall'})).toBeInTheDocument();
    expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  } finally {vi.useRealTimers();}
});

function progressMeaning(days:number,first='2026-10-10T10:00:00Z') {
  const sense={id:'progress-sense',pos:'noun',definition:'A classroom term.',example:'We practise progressword in class.',source:'Personal note'};
  const entry={id:'progress-entry',term:'progressword',category:'word',meaning:sense.definition,example:sense.example,senses:[sense],tags:[],sources:[],createdAt:first,updatedAt:first};
  mocks.fb.state.vocabulary=[entry];
  mocks.fb.state.vocabularyEvidence=[];
  for(let day=0;day<days;day++)for(const dimension of ['meaning','listening','spelling','usage'])mocks.fb.state.vocabularyEvidence.push({
    id:dimension+day,entryId:entry.id,senseId:sense.id,dimension,mode:dimension==='meaning'?'definition':dimension==='usage'?'cloze':'dictation',result:'success',verification:'objective',
    occurredAt:new Date(Date.parse(first)+day*86400000).toISOString(),sourceType:'personal',sourceId:'progress-lesson',
  });
  return '/vocabulary/entry/'+entry.id+'?senseId='+sense.id;
}
test('same-day progress updates from a spacing wait to a real next practice while the page remains open',async()=>{
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-17T09:59:00Z'));
    const path=progressMeaning(1,'2026-10-16T10:00:00Z');
    await act(async()=>{mount(path);});
    const panel=screen.getByRole('region',{name:'Next practice'});
    expect(panel).toHaveTextContent('Your next spaced practice is available from');
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    await act(async()=>{vi.advanceTimersByTime(60050);});
    expect(panel).toHaveTextContent('another spaced success towards Familiar');
    expect(within(panel).getByRole('link',{name:'Practise Meaning recall'})).toBeInTheDocument();
    expect(mocks.fb.persistNow).not.toHaveBeenCalled();
  } finally {vi.useRealTimers();}
});
test('familiar progress offers use in context for the same meaning with assessed-feedback guidance',async()=>{
  const path=progressMeaning(3);
  const before=structuredClone(mocks.fb.state);
  mount(path);
  const panel=await screen.findByRole('region',{name:'Next practice'});
  expect(panel).toHaveTextContent('Mastered needs two assessed production successes');
  expect(panel).toHaveTextContent('needs assessed feedback before it can count towards mastery');
  const route=new URL(within(panel).getByRole('link',{name:'Practise Use in context'}).getAttribute('href')!,'https://test.test');
  expect(route.searchParams.get('senseId')).toBe('progress-sense');expect(route.searchParams.get('mode')).toBe('production');
  expect(mocks.fb.state).toEqual(before);expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

const linkedMeaning = { id: 'dictionary:linked-meaning', pos: 'noun', definition: 'Evidence in favour of a proposal.', example: 'There is support for this proposal.', source: 'English Wiktionary' };
function linkedDictionary(delay?: Promise<void>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.endsWith('index.json')) await delay;
    return { ok: true, json: async () => url.endsWith('index.json') ? { core: 'aa.json' } : { senses: [linkedMeaning] } };
  }));
}
function ChangeEntry({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>Change entry</button>;
}

test('an unsaved dictionary deep link resolves after lookup without saving or learning evidence', async () => {
  let finish!: () => void;
  linkedDictionary(new Promise(resolve => { finish = resolve; }));
  const before = JSON.stringify(mocks.fb.state);
  const view = mount(`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`);
  expect(screen.queryByText('Definition not available yet')).not.toBeInTheDocument();
  await act(async () => finish());
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('practising a linked dictionary meaning saves only that sense before navigating', async () => {
  linkedDictionary();
  mocks.fb.persistNow.mockResolvedValue(true);
  const view = mount(`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`);
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  await userEvent.click(screen.getByRole('button', { name: 'Practise this word' }));
  const draft = mocks.fb.persistNow.mock.calls[0][0];
  expect(draft.vocabulary[0].senses.map((sense: any) => sense.id)).toEqual([linkedMeaning.id]);
  expect(draft.vocabularyEvidence).toEqual([]);
  expect(draft.vocabularyReviews).toEqual([]);
  const route = new URL(screen.getByLabelText('Current route').textContent!, 'https://example.test');
  expect(route.pathname).toBe('/vocabulary/review');
  expect(route.searchParams.get('senseId')).toBe(linkedMeaning.id);
});

test('a failed linked-meaning save stays on the detail page and can be retried', async () => {
  linkedDictionary();
  mocks.fb.persistNow.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const path = `/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`;
  const view = mount(path);
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  await userEvent.click(screen.getByRole('button', { name: 'Practise this word' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This sense could not be saved. Try again.');
  expect(screen.getByLabelText('Current route')).toHaveTextContent(path);
  expect(mocks.fb.state.vocabulary).toEqual([]);
  await userEvent.click(screen.getByRole('button', { name: 'Practise this word' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/vocabulary/review?');
});

test('saved edits to a dictionary deep link win over fetched dictionary content', async () => {
  linkedDictionary();
  mocks.fb.state.vocabulary = [{ ...core(), senses: [{ ...linkedMeaning, definition: 'My own meaning.' }] }];
  const view = mount(`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent('My own meaning.');
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('a dictionary deep link never borrows a different entry’s loaded meanings', async () => {
  linkedDictionary();
  const next = release.entries.find((entry: any) => entry.term === 'support');
  const view = render(<MemoryRouter initialEntries={[`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`]}>
    <ChangeEntry to={`/vocabulary/entry/${next.id}?senseId=${linkedMeaning.id}`} />
    <Routes><Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} /></Routes>
  </MemoryRouter>);
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  await userEvent.click(screen.getByRole('button', { name: 'Change entry' }));
  expect(view.container.querySelector('.vocabulary-primary-meaning')).toBeNull();
  await waitFor(() => expect(screen.getByText('This dictionary meaning could not be found.')).toBeInTheDocument());
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('unknown explicit meanings show an honest missing state after dictionary lookup', async () => {
  linkedDictionary();
  mount(`/vocabulary/entry/${core().id}?senseId=unknown-meaning`);
  expect(await screen.findByText('This dictionary meaning could not be found.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Practise this word/ })).not.toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('a failed explicit dictionary lookup offers a retry that resolves the same meaning', async () => {
  let available = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: url.endsWith('index.json') || available,
    json: async () => url.endsWith('index.json') ? { core: 'aa.json' } : { senses: [linkedMeaning] } })));
  const view = mount(`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`);
  expect(await screen.findByText('This dictionary meaning could not be loaded.')).toBeInTheDocument();
  available = true;
  await userEvent.click(screen.getByRole('button', { name: 'Retry meaning' }));
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('a dictionary response arriving after changing entries cannot replace the new selection', async () => {
  let finish!: () => void;
  linkedDictionary(new Promise(resolve => { finish = resolve; }));
  const next = release.entries.find((entry: any) => entry.term === 'support');
  const view = render(<MemoryRouter initialEntries={[`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`]}>
    <ChangeEntry to={`/vocabulary/entry/${next.id}?senseId=${linkedMeaning.id}`} />
    <Routes><Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} /></Routes>
  </MemoryRouter>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await userEvent.click(screen.getByRole('button', { name: 'Change entry' }));
  await act(async () => finish());
  expect(view.container.querySelector('.vocabulary-primary-meaning')).toBeNull();
  expect(await screen.findByText('This dictionary meaning could not be found.')).toBeInTheDocument();
});

test('a linked-meaning save completing after navigation cannot reopen the old practice', async () => {
  linkedDictionary();
  let finish!: (value: boolean) => void;
  mocks.fb.persistNow.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const next = release.entries.find((entry: any) => entry.term === 'support');
  const view = render(<MemoryRouter initialEntries={[`/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`]}>
    <ChangeEntry to={`/vocabulary/entry/${next.id}`} />
    <Routes><Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} /></Routes><Location />
  </MemoryRouter>);
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  await userEvent.click(screen.getByRole('button', { name: 'Practise this word' }));
  await userEvent.click(screen.getByRole('button', { name: 'Change entry' }));
  await act(async () => finish(true));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(`/vocabulary/entry/${next.id}`);
});

test('switching accounts during a linked-meaning save does not navigate the new account', async () => {
  setAccountIdentity('owner-a');
  linkedDictionary();
  let finish!: (value: boolean) => void;
  mocks.fb.persistNow.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const path = `/vocabulary/entry/${core().id}?senseId=${linkedMeaning.id}`;
  const view = mount(path);
  await waitFor(() => expect(view.container.querySelector('.vocabulary-primary-meaning')).toHaveTextContent(linkedMeaning.definition));
  await userEvent.click(screen.getByRole('button', { name: 'Practise this word' }));
  setAccountIdentity('owner-b');
  await act(async () => finish(true));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(path);
});

test('a saved meaning refreshes after scoped teaching arrives without replacing personal edits', async () => {
  const sense = { id: 'late-source', definition: 'A source meaning.', example: 'The original example.', pos: 'noun', source: 'English Wiktionary' };
  const entry = { ...core(), id: 'vocab:late-teaching', term: 'lateword', senses: [sense] };
  VOCABULARY_CATALOG.entries = [...VOCABULARY_CATALOG.entries, entry];
  mocks.fb.state.vocabulary = [entry];
  let finish!: (value: boolean) => void;
  mocks.fb.loadVocabularyCatalog = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const corrections = vocabularyTeaching.readiness.corrections;
  const view = mount(`/vocabulary/entry/${entry.id}?senseId=${sense.id}`);
  try {
    expect(screen.getByText(sense.example)).toBeInTheDocument();
    await act(async () => {
      registerVocabularyTeaching({ ...vocabularyTeaching, readiness: { ...vocabularyTeaching.readiness, corrections: [
        { entryId: entry.id, senseId: sense.id, originalSense: sense, definition: sense.definition, example: 'The reviewed example.' },
      ] } });
      mocks.fb.vocabularyCatalogRevision = 1;
      finish(true);
    });
    expect(await screen.findByText('The reviewed example.')).toBeInTheDocument();
    expect(mocks.fb.state.vocabulary[0]).toBe(entry);
    mocks.fb.state.vocabulary = [{ ...entry, senses: [{ ...sense, example: 'My own example.' }] }];
    view.rerender(<MemoryRouter initialEntries={[`/vocabulary/entry/${entry.id}?senseId=${sense.id}`]}><Routes><Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} /></Routes></MemoryRouter>);
    expect(screen.getByText('My own example.')).toBeInTheDocument();
  } finally {
    vocabularyTeaching.readiness.corrections = corrections;
    registerVocabularyTeaching(vocabularyTeaching);
  }
});

test('a saved spelling-error reference explains the correct form without a main or secondary practice link', () => {
  const entry = release.entries.find((entry: any) => entry.term === 'effect');
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const reference = JSON.parse(readFileSync(`public/dictionary/${index.effect}`, 'utf8')).senses.find((sense: any) => sense.id === 'kaikki:fe6c98c80e453fd028');
  mocks.fb.state.vocabulary = [{ ...entry, senses: [reference] }];
  mount(`/vocabulary/entry/${entry.id}?senseId=${encodeURIComponent(reference.id)}`);
  expect(screen.getByText('A recorded spelling error for affect when the intended meaning is influence.')).toBeInTheDocument();
  expect(screen.getByText(/Spelling reference · Choose a valid meaning/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Practise this word/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Practise this sense/ })).not.toBeInTheDocument();
});

test('an explicitly selected river meaning displays its diagram and learning notes in word details', async () => {
  const bank = release.entries.find((entry: any) => entry.term === 'bank');
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const river = JSON.parse(readFileSync(`public/dictionary/${index.bank}`, 'utf8')).senses.find((sense: any) => sense.id === 'kaikki:c130710755a265600e');
  mocks.fb.state.vocabulary = [{ ...bank, senses: [river, ...bank.senses] }];
  mount(`/vocabulary/entry/${bank.id}?senseId=${encodeURIComponent(river.id)}`);
  expect(screen.getByText('We sat on the bank of the river and watched the boats.')).toBeInTheDocument();
  expect(await screen.findByRole('img', { name: 'bank: Land beside a flowing river' })).toBeInTheDocument();
});

test('pea details show the food meaning with the same illustration as its learning card', () => {
  const pea = release.entries.find((entry: any) => entry.term === 'pea');
  mount(`/vocabulary/entry/${pea.id}?bookId=${book}&unitId=ielts-vocabulary-chapter-12-group-02`);
  expect(screen.getByText('Add the peas to the soup near the end of cooking.')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'pea: Green peas in an open pod' })).toBeInTheDocument();
  expect(screen.getByText('Meaning source')).toBeInTheDocument();
  expect(screen.queryByText('Theme learning meaning')).not.toBeInTheDocument();
});

test('an explicit plant meaning keeps its identity and offers a direct route to the group meaning', async () => {
  const pea = release.entries.find((entry: any) => entry.term === 'pea');
  const origin = '/vocabulary/history?bookId=ielts-vocabulary';
  mount(`/vocabulary/entry/${pea.id}?bookId=${book}&unitId=ielts-vocabulary-chapter-12-group-02&senseId=${pea.senses[0].id}&returnTo=${encodeURIComponent(origin)}`);
  expect(screen.getByText('The pea plant climbed the garden support.')).toBeInTheDocument();
  expect(screen.queryByText('Your selected meaning')).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Green peas/ })).not.toBeInTheDocument();
  const target = screen.getByRole('link', { name: 'View group meaning' });
  expect(new URL(target.getAttribute('href')!, 'https://test.test').searchParams.get('returnTo')).toBe(origin);
  await userEvent.setup().click(target);
  expect(screen.getByText('The small edible seed of the pea plant.')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Green peas/ })).toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('an empty personal example can show a separate public learning example for exactly the same meaning', () => {
  const pea = structuredClone(release.entries.find((entry: any) => entry.term === 'pea'));
  pea.senses[0].source = 'Personal note';
  pea.senses[0].register = 'My garden vocabulary.';
  mocks.fb.state.vocabulary = [pea];
  const before = JSON.stringify(mocks.fb.state);
  mount(`/vocabulary/entry/${pea.id}?bookId=${book}&unitId=ielts-vocabulary-chapter-12-group-02`);
  const primary = document.querySelector('.vocabulary-primary-meaning')!;
  expect(within(primary as HTMLElement).getByText('Learning example')).toBeInTheDocument();
  expect(within(primary as HTMLElement).getByText('The pea plant climbed the garden support.')).toBeInTheDocument();
  expect(within(screen.getByText('Sources & licenses').closest('details')!).getByText('Fieldbook core content review')).toBeInTheDocument();
  expect(screen.getByText('My garden vocabulary.')).toBeInTheDocument();
  expect(screen.queryByText('Example not available yet')).not.toBeInTheDocument();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('a personal changed meaning never borrows an example from a different meaning', () => {
  const pea = structuredClone(release.entries.find((entry: any) => entry.term === 'pea'));
  pea.senses[0] = { ...pea.senses[0], definition: 'My nickname for a tiny room.', source: 'Personal note', example: '' };
  mocks.fb.state.vocabulary = [pea];
  mount(`/vocabulary/entry/${pea.id}?bookId=${book}&unitId=ielts-vocabulary-chapter-12-group-02`);
  const primary = document.querySelector('.vocabulary-primary-meaning')!;
  expect(within(primary as HTMLElement).getByText('No example for this meaning.')).toBeInTheDocument();
  expect(within(primary as HTMLElement).queryByText(/soup|garden support/)).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('public dictionary snapshots are not presented as personal original notes', () => {
  const raw=release.entries.find((entry:any)=>entry.term==='supplement');
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-03`);
  expect(screen.getByText('A vitamin supplement can help address a diagnosed deficiency.')).toBeInTheDocument();
  expect(screen.queryByText('Original notes')).not.toBeInTheDocument();
  expect(screen.queryByText(/Thesaurus:adjunct/)).not.toBeInTheDocument();
});

test('an unselected original dictionary sense is kept in the dictionary rather than added to learning progress', async () => {
  const raw=release.entries.find((entry:any)=>entry.term==='field work');
  const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
  const dictionary=JSON.parse(readFileSync(`public/dictionary/${index['field work']}`,'utf8'));
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{'field work':'aa.json'}:dictionary})));
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-listening-vocabulary&unitId=ielts-listening-vocabulary-chapter-03-group-04`);
  await screen.findByText('A temporary fortification in the field');
  const originalSense=screen.getByText('A temporary fortification in the field');
  expect(originalSense.closest('.vocabulary-dictionary')).not.toBeNull();
  expect(screen.queryByText(/Other learning meanings/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('heading',{name:'Progress for this meaning'})).toHaveLength(1);
});

test('legacy notes absent from every stored sense remain available without dictionary markup', () => {
  const raw=structuredClone(core());
  raw.meaning='My [[geology]] meaning.';
  raw.example='We examined the [[core]] from the borehole.';
  mocks.fb.state.vocabulary=[raw];
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-01-group-01`);
  expect(screen.getByText('Original notes')).toBeInTheDocument();
  expect(screen.getByText('My geology meaning.')).toBeInTheDocument();
  expect(screen.getByText('We examined the core from the borehole.')).toBeInTheDocument();
});
test('word detail preserves exact exam occurrences and links to the original source', async () => {
  const raw = structuredClone(core());
  raw.sources = [{ type: 'reading', id: 'part-one', senseId: raw.senses[0].id, context: 'The core of the argument.', exam: { sectionId: 'part-one', paragraphId: 'A', blockId: 'passage:p:A', quote: 'core', start: 4, end: 8 } }];
  mocks.fb.state.vocabulary = [raw];
  mount(`/vocabulary/entry/${raw.id}`);
  await screen.findByRole('region', { name: 'Exam sources' });
  expect(screen.getByRole('link', { name: 'Original source' })).toHaveAttribute('href', expect.stringContaining('/reading/source/part-one?paragraph=A&block=passage%3Ap%3AA&quote=core'));
});
test("group browsing works before enrollment, deduplicates source order, includes archived, and play creates no learning writes", async () => {
  const raw = core();
  mocks.fb.state.vocabulary = [{ ...structuredClone(raw), tags: ["archived"] }];
  const before = JSON.stringify(mocks.fb.state);
  mount(`/vocabulary/wordbooks/${book}/groups/ielts-vocabulary-chapter-01-group-01/words`);
  await screen.findByRole("heading", { name: "Group 1 words" });
  expect(
    screen.getByText("55 unique words · Original source order"),
  ).toBeInTheDocument();
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(51);
  expect(rows[1]).toHaveTextContent("1");
  expect(
    within(rows.find((row) => row.textContent?.includes("core"))!).getByText(
      "Archived",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Start assessment/ }),
  ).toHaveAttribute(
    "href",
    `/vocabulary/study?bookId=${encodeURIComponent(book)}&unitId=ielts-vocabulary-chapter-01-group-01&dueOnly=false`,
  );
  await userEvent
    .setup()
    .click(screen.getAllByRole("button", { name: /Play UK pronunciation/ })[0]);
  expect(mocks.player.play).toHaveBeenCalledOnce();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("235-group search and 50 pagination preserve original indexes and full study selection", async () => {
  mount("/vocabulary/wordbooks/ielts-listening-vocabulary/groups/ielts-listening-vocabulary-chapter-03-group-12/words?page=4");
  await screen.findByRole("heading", { name: "Group 12 words" });
  expect(screen.getByText("201–235 of 235 · 50 per page")).toBeInTheDocument();
  const first = screen.getAllByRole("row")[1];
  expect(within(first).getByText("201")).toBeInTheDocument();
  const term = first.querySelector("a")!.textContent!;
  await userEvent
    .setup()
    .type(screen.getByRole("textbox", { name: "Search group words" }), term);
  expect(screen.getByLabelText("Current route")).toHaveTextContent("search=");
  expect(screen.getByLabelText("Current route")).not.toHaveTextContent(
    "page=4",
  );
  expect(
    screen.getByRole("link", { name: /Start assessment/ }),
  ).toHaveAttribute(
    "href",
    "/vocabulary/study?bookId=ielts-listening-vocabulary&unitId=ielts-listening-vocabulary-chapter-03-group-12&dueOnly=false",
  );
  expect(
    screen.getAllByRole("row").some((row) => row.textContent?.includes("201")),
  ).toBe(true);
});
test("detail uses distinct confirmed core group content, one bottom credits collection, and the exact origin drill", async () => {
  const raw = core();
  const resolved = resolveVocabularyLearningContext(raw, {
    bookId: book,
    unitId: "ielts-vocabulary-chapter-12-group-02",
  });
  const origin = `/vocabulary/entry/${raw.id}?bookId=${encodeURIComponent(book)}&unitId=ielts-vocabulary-chapter-12-group-02&returnTo=${encodeURIComponent(`/vocabulary/wordbooks/${book}/groups/ielts-vocabulary-chapter-12-group-02/words?search=core&page=0`)}`;
  mount(origin);
  expect(
    screen.getByRole("heading", { name: "Meaning" }),
  ).toBeInTheDocument();
  expect(screen.getByText(resolved.sense!.definition)).toBeInTheDocument();
  const practice = new URL(
    screen
      .getByRole("link", { name: /Practise this word/ })
      .getAttribute("href")!,
    "https://test.test",
  );
  expect(practice.searchParams.get("senseId")).toBe(
    "editorial:core:fruit-centre",
  );
  expect(practice.searchParams.get("unitId")).toBe("ielts-vocabulary-chapter-12-group-02");
  expect(practice.searchParams.get("returnTo")).toBe(origin);
  expect(screen.getByRole("link", { name: "Image credits" })).toHaveAttribute(
    "href",
    "#vocabulary-sources",
  );
  expect(screen.getByAltText(/apple|fruit/i)).toBeInTheDocument();
  await screen.findByText("Recording author");
  expect(screen.getAllByText("Sources & licenses")).toHaveLength(1);
  expect(
    screen.getByText("Sources & licenses").closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.getByText(/Other dictionary meanings/).closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.queryByText(/Other learning meanings/)).not.toBeInTheDocument();
  expect(screen.queryByText("Sense 1")).not.toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("common-list group has an explicit learning syllabus without claiming source confirmation", async () => {
  const raw = release.entries.find((entry: any) => entry.term === "cashier");
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-listening-vocabulary&unitId=ielts-listening-vocabulary-chapter-01-group-02`);
  await screen.findByText("Meaning source");
  expect(
    screen.getByRole("heading", { name: "Meaning" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Meaning in this listening passage"),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
test("detail back preserves list filters and focus across real route navigation", async () => {
  const view = mount(
    `/vocabulary/wordbooks/${book}/groups/ielts-vocabulary-chapter-12-group-02/words?search=core`,
  );
  await screen.findByRole("heading", { name: "Group 2 words" });
  const coreLink = screen.getByRole("link", { name: "core" });
  await userEvent.setup().click(coreLink);
  expect(screen.getByRole("heading", { name: "core" })).toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("link", { name: "Back to group words" }));
  await screen.findByRole("heading", { name: "Group 2 words" });
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "core" })).toHaveFocus(),
  );
  expect(
    screen.getByRole("textbox", { name: "Search group words" }),
  ).toHaveValue("core");
  view.unmount();
});
test("browse distinguishes load error, retry and invalid group", async () => {
  mocks.fb.loadVocabularyCatalog.mockRejectedValueOnce(new Error("offline"));
  mount(`/vocabulary/wordbooks/${book}/groups/missing/words`);
  expect(screen.getByText("Loading group words…")).toHaveAttribute(
    "role",
    "status",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry group" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "group is unavailable",
  );
});
function resultsFixture(mode = "dictation") {
  const raw = core();
  const row = {
    cardId: "core-card",
    entryId: raw.id,
    senseId: raw.senses[0].id,
    term: "core",
    response: "cor",
    expectedAnswer: "core",
    result: "failure",
    definition: "An old definition.",
    example: "Old example.",
  };
  return {
    id: "old-session",
    mode,
    status: "submitted",
    startedAt: "2025-01-01",
    submittedAt: "2025-01-01",
    preferences: normalizeVocabularyPreferences({}),
    filter: { bookId: book, unitId: "ielts-vocabulary-chapter-12-group-02" },
    selection: { kind: "unit", bookId: book, unitId: "ielts-vocabulary-chapter-12-group-02" },
    results: [row],
    summary: { correct: 0, incorrect: 1, total: 1, pending: 0 },
    entryIds: [raw.id],
    reviewIds: [],
    updatedAt: "2025-01-01",
  } as any;
}
function showResults(results: any) {
  const controller = {
    state: mocks.fb.state,
    resultFilter: "all",
    resultRows: results.results,
    setResultFilter: vi.fn(),
    resetResults: vi.fn(),
    retryMistakes: vi.fn(),
    resultReturnTo: "/vocabulary/history/old-session?resultFilter=incorrect",
    preferences: normalizeVocabularyPreferences({ accent: "us" }),
  };
  return render(
    <MemoryRouter>
      <VocabularyPracticeResults
        controller={controller as any}
        results={results}
      />
    </MemoryRouter>,
  );
}
test("historical dictation shows current group reference but frozen score and grading stay immutable", async () => {
  const results = resultsFixture();
  const before = JSON.stringify(results);
  showResults(results);
  expect(
    screen.getByText(/Current learning reference updated/),
  ).toBeInTheDocument();
  expect(screen.getByText(/fruit.*seeds/i)).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "0 of 1 correct" }),
  ).toBeInTheDocument();
  const details = new URL(
    screen.getByRole("link", { name: "Details" }).getAttribute("href")!,
    "https://test.test",
  );
  expect(details.searchParams.get("senseId")).toBe(
    "editorial:core:fruit-centre",
  );
  expect(details.searchParams.get("unitId")).toBe("ielts-vocabulary-chapter-12-group-02");
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Play US pronunciation of core" }),
    );
  expect(mocks.player.play).toHaveBeenCalledWith(
    expect.objectContaining({ term: "core" }),
    expect.objectContaining({ accent: "us" }),
  );
  expect(JSON.stringify(results)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("non-dictation preserves frozen prompt and adds current definition separately with no production diff", () => {
  const results = resultsFixture("production");
  results.results[0].prompt = "The original question.";
  showResults(results);
  expect(screen.getByText("An old definition.")).toBeInTheDocument();
  expect(screen.getByText("The original question.")).toBeInTheDocument();
  expect(screen.getByText(/Current meaning:/)).toBeInTheDocument();
  expect(document.querySelector(".practice-answer-difference")).toBeNull();
  const details = new URL(
    screen.getByRole("link", { name: "Details" }).getAttribute("href")!,
    "https://test.test",
  );
  expect(details.searchParams.get("senseId")).toBe(core().senses[0].id);
});
test("wordbook navigation stays active on direct group browsing route", () => {
  render(
    <MemoryRouter
      initialEntries={["/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-01-group-01/words"]}
    >
      <VocabularyNavigation />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Wordbooks" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
test("edited learner notes remain visible as notes without a context-reviewed heading or image", () => {
  const raw = structuredClone(core());
  const resolved = resolveVocabularyLearningContext(raw, {
    bookId: book,
    unitId: "ielts-vocabulary-chapter-01-group-01",
  });
  raw.senses = [
    {
      ...resolved.sense!,
      usage: "My geology note.",
      collocations: ["my own core phrase"],
      synonyms: ["my synonym note"],
      register: "My note: formal geology reports only.",
    },
  ];
  mocks.fb.state.vocabulary = [raw];
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-01-group-01`);
  expect(
    screen.getByRole("heading", { name: "Meaning" }),
  ).toBeInTheDocument();
  expect(screen.getByText("My geology note.")).toBeInTheDocument();
  expect(screen.getByText("Your collocation notes")).toBeInTheDocument();
  expect(screen.getByText("my own core phrase")).toBeInTheDocument();
  expect(screen.getByText("my synonym note")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Your register note" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("My note: formal geology reports only."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Reviewed register" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
test("raw evidence without a review retains response, verification, result and date under entry and matching sense", () => {
  const raw = core();
  mocks.fb.state.vocabularyEvidence = [
    {
      id: "pending-production",
      entryId: raw.id,
      senseId: "editorial:core:fruit-centre",
      sourceType: "personal",
      sourceId: "production",
      mode: "production",
      dimension: "usage",
      response: "I removed the core from the apple.",
      result: "pending",
      verification: "self-reported",
      occurredAt: "2026-10-10T10:00:00Z",
    },
    {
      id: "original-sense",
      entryId: raw.id,
      senseId: raw.senses[0].id,
      sourceType: "personal",
      sourceId: "manual",
      mode: "definition",
      dimension: "meaning",
      response: "My earlier meaning answer.",
      result: "partial",
      verification: "assessed",
      occurredAt: "2026-10-09T10:00:00Z",
    },
    {
      id: "legacy-entry",
      entryId: raw.id,
      sourceType: "personal",
      sourceId: "legacy",
      mode: "production",
      dimension: "usage",
      response: "A saved entry-level response.",
      result: "pending",
      verification: "pending",
      occurredAt: "2026-10-08T10:00:00Z",
    },
    {
      id: "other-entry",
      entryId: "different-word",
      sourceType: "personal",
      sourceId: "other",
      mode: "production",
      dimension: "usage",
      response: "An unrelated response.",
      result: "success",
      verification: "objective",
      occurredAt: "2026-10-07T10:00:00Z",
    },
  ];
  const before = JSON.stringify(mocks.fb.state);
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02`);
  const history = screen.getByText(/Learning history \(/).closest("details")!;
  expect(history).not.toHaveAttribute("open");
  const historyView = within(history);
  expect(
    historyView.getByText("I removed the core from the apple."),
  ).toBeInTheDocument();
  expect(
    historyView.getByText("Verification: Self-reported"),
  ).toBeInTheDocument();
  expect(historyView.getAllByText("Result: Pending")).toHaveLength(2);
  expect(historyView.getByText(/10\/10\/2026/)).toBeInTheDocument();
  expect(
    historyView.getByText("My earlier meaning answer."),
  ).toBeInTheDocument();
  expect(
    historyView.getByText("A saved entry-level response."),
  ).toBeInTheDocument();
  expect(
    historyView.queryByText("An unrelated response."),
  ).not.toBeInTheDocument();
  expect(
    screen.getAllByText("I removed the core from the apple."),
  ).toHaveLength(1);
  expect(
    screen.queryByText("Learning evidence for this meaning"),
  ).not.toBeInTheDocument();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("confirmed register content is labelled reviewed while raw public register is not promoted", async () => {
  const raw = core();
  const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
  const dictionary=JSON.parse(readFileSync(`public/dictionary/${index.core}`,'utf8'));
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{core:'aa.json'}:dictionary})));
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02`);
  const main = screen
    .getByRole("heading", { name: "Meaning" })
    .closest("section")!;
  expect(
    within(main).getByRole("heading", { name: "Reviewed register" }),
  ).toBeInTheDocument();
  expect(within(main).getByText("General modern English")).toBeInTheDocument();
  const other = (await screen.findByText(/Other dictionary meanings \([1-9]/)).closest("details")!;
  expect(
    within(other).queryByRole("heading", { name: "Reviewed register" }),
  ).not.toBeInTheDocument();
  expect(
    within(other).queryByRole("heading", { name: "Your register note" }),
  ).not.toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("a register-only learner edit retains a personal label and does not claim context review", () => {
  const raw = structuredClone(core());
  raw.senses = [
    {
      ...resolveVocabularyLearningContext(raw, {
        bookId: book,
        unitId: "ielts-vocabulary-chapter-01-group-01",
      }).sense!,
      register: "My register-only edit.",
    },
  ];
  mocks.fb.state.vocabulary = [raw];
  const before = JSON.stringify(mocks.fb.state);
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-01-group-01`);
  expect(
    screen.getByRole("heading", { name: "Your register note" }),
  ).toBeInTheDocument();
  expect(screen.getByText("My register-only edit.")).toBeInTheDocument();
  expect(
    screen.queryByText("Selected group meaning"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Reviewed register" }),
  ).not.toBeInTheDocument();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("failed familiarity saving remains distinct from evidence and allows retry without changing stored records", async () => {
  const raw = structuredClone(core());
  mocks.fb.state.vocabulary = [raw];
  mocks.fb.state.vocabularyEvidence = [
    {
      entryId: raw.id,
      senseId: "editorial:core:fruit-centre",
      sourceType: "personal",
      sourceId: "production",
      mode: "production",
      dimension: "usage",
      response: "A previously submitted response.",
      result: "pending",
      verification: "pending",
      occurredAt: "2026-10-10T10:00:00Z",
    },
  ];
  const before = JSON.stringify(mocks.fb.state);
  let finishSave!: (value: boolean) => void;
  mocks.fb.persistNow
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    )
    .mockResolvedValueOnce(true);
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02`);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Familiarity for this meaning" }),
  );
  await user.click(screen.getByRole("option", { name: "Familiar" }));
  expect(
    screen.queryByText("Familiarity could not be saved. Try again."),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Familiarity for this meaning" }),
  ).toBeDisabled();
  expect(mocks.fb.persistNow).toHaveBeenCalledTimes(1);
  finishSave(false);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Familiarity could not be saved. Try again.",
  );
  const history = screen.getByText(/Learning history \(/).closest("details")!;
  expect(
    within(history).getByText("A previously submitted response."),
  ).toBeInTheDocument();
  expect(
    within(history).getByText("Verification: Pending"),
  ).toBeInTheDocument();
  expect(within(history).getByText("Result: Pending")).toBeInTheDocument();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  await user.click(
    screen.getByRole("button", { name: "Familiarity for this meaning" }),
  );
  await user.click(screen.getByRole("option", { name: "Familiar" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Familiarity could not be saved. Try again."),
    ).not.toBeInTheDocument(),
  );
  expect(mocks.fb.persistNow).toHaveBeenCalledTimes(2);
  expect(mocks.fb.persistNow.mock.calls[1][0].vocabularyEvidence).toEqual(
    mocks.fb.state.vocabularyEvidence,
  );
});
test("a deliberate familiarity save targets the displayed new stable sense without retargeting the original", async () => {
  const raw = structuredClone(core());
  mocks.fb.state.vocabulary = [raw];
  mocks.fb.persistNow.mockResolvedValue(true);
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02`);
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Familiarity for this meaning" }),
    );
  await userEvent
    .setup()
    .click(screen.getByRole("option", { name: "Familiar" }));
  const saved = mocks.fb.persistNow.mock.calls[0][0];
  expect(
    saved.vocabularyStates.find((row: any) => row.manualStatus === "familiar")
      .senseId,
  ).toBe("editorial:core:fruit-centre");
  expect(
    saved.vocabulary[0].senses.some(
      (sense: any) => sense.id === raw.senses[0].id,
    ),
  ).toBe(true);
  expect(saved.vocabularyReviews).toHaveLength(0);
});

test("source switching removes the old requested sense and preserves the list return", async () => {
  const raw = structuredClone(core());
  mount(
    `/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02&senseId=editorial%3Acore%3Afruit-centre&returnTo=%2Fvocabulary%3Fsearch%3Dcore`,
  );
  const sources = screen.getByRole("region", { name: "Wordbook sources" });
  const links = within(sources).getAllByRole("link");
  expect(links.length).toBeGreaterThan(1);
  const target = links.find(
    (link) =>
      new URL(link.getAttribute("href")!, "https://test.test").searchParams.get(
        "unitId",
      ) === "ielts-vocabulary-chapter-01-group-01",
  )!;
  const next = new URL(target.getAttribute("href")!, "https://test.test");
  expect(next.searchParams.has("senseId")).toBe(false);
  expect(next.searchParams.get("returnTo")).toBe("/vocabulary?search=core");
  await userEvent.setup().click(target);
  expect(
    screen.getByRole("link", { name: "Back to vocabulary" }),
  ).toHaveAttribute("href", "/vocabulary?search=core");
  expect(
    screen
      .getByRole("heading", { name: "Meaning" })
      .closest("section"),
  ).not.toHaveTextContent("The hard central part of a fruit");
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test("automatic mastery and manual override are distinct, restoring automatic only changes preference", async () => {
  const raw = structuredClone(core());
  mocks.fb.state.vocabulary = [raw];
  mocks.fb.state.vocabularyStates = [
    {
      id: "state",
      entryId: raw.id,
      senseId: "editorial:core:fruit-centre",
      statusSource: "manual",
      manualStatus: "mastered",
      dimensions: {},
      cards: {},
      wrong: { active: false, successesSinceFailure: 0, modes: {} },
      reviewCount: 0,
      updatedAt: raw.updatedAt,
    },
  ];
  mocks.fb.persistNow.mockResolvedValue(true);
  mount(`/vocabulary/entry/${raw.id}?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-12-group-02`);
  expect(screen.getByText("System estimate: New")).toBeInTheDocument();
  expect(screen.getByText("Manual")).toBeInTheDocument();
  const before = JSON.stringify(mocks.fb.state);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Use automatic" }));
  const draft = mocks.fb.persistNow.mock.calls[0][0];
  expect(
    draft.vocabularyStates.find(
      (row: any) => row.senseId === "editorial:core:fruit-centre",
    ).statusSource,
  ).toBe("automatic");
  expect(draft.vocabularyReviews).toEqual([]);
  expect(draft.vocabularyEvidence).toEqual([]);
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
});

test("one linked dictation event appears once with both dimensions and truthful historical failure", () => {
  const raw = structuredClone(core());
  raw.term = "colour";
  mocks.fb.state.vocabulary = [raw];
  const review = {
    id: "event",
    entryId: raw.id,
    senseId: raw.senses[0].id,
    mode: "dictation",
    result: "failure",
    response: "color",
    occurredAt: "2026-10-10T10:00:00Z",
    updatedAt: "2026-10-10T10:00:00Z",
  };
  mocks.fb.state.vocabularyReviews = [review];
  mocks.fb.state.vocabularyEvidence = ["listening", "spelling"].map(
    (dimension) => ({
      ...review,
      id: `event:${dimension}`,
      dimension,
      sourceType: "personal",
      sourceId: "event",
      verification: "objective",
    }),
  );
  mount(`/vocabulary/entry/${raw.id}`);
  expect(screen.getAllByText("color")).toHaveLength(1);
  expect(screen.getByText("Listening + Spelling")).toBeInTheDocument();
  expect(screen.getByText("Result: Failure")).toBeInTheDocument();
  expect(
    screen.getByText(/historical result remains Failure/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Learning history \(1\)/)).toBeInTheDocument();
});
