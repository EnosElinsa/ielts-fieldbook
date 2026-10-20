import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Pronunciation, playbackMessage } from './Pronunciation';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
import * as sensePronunciation from '../../domain/vocabulary/sensePronunciation';
const state = vi.hoisted(() => ({ load: vi.fn(), play: vi.fn(), stop: vi.fn() }));
vi.mock('../../domain/vocabulary/media', () => ({ getVocabularyMedia: state.load }));
vi.mock('./playback', () => ({ createVocabularyPlayback: () => ({ play: state.play, stop: state.stop }) }));
const entry = { id: 'example', term: 'vegetable' } as VocabularyEntry;
const noun={id:'kaikki:5386f9871d2cf75669',definition:'Information preserved in a medium for later reference.',pos:'noun',example:'Keep a record.'};
const verb={id:'kaikki:a81bc2a2a960622df9',definition:'To preserve information by writing it down or storing it in another medium.',pos:'verb',example:'Please record the temperature every hour.'};
const record={...entry,id:'ve-7e9f7328',term:'record',senses:[noun,verb],pronunciation:{ipa:'wrong entry IPA'}};
beforeEach(() => { state.load.mockReset(); state.play.mockReset(); state.stop.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('pronunciation controls', () => {
 test('a verified meaning recording with a failed availability check offers an explicit retry',async()=>{
  const audio={url:'https://example.org/matched.ogg',title:'Matched reading',accent:'us' as const,status:'verified' as const,availability:'failed' as const,wordformConfirmed:true,sourceUrl:'https://example.org/revision',author:'Speaker',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',changes:'None',reason:'HTTP 429 observed.'};
  const lookup=vi.spyOn(sensePronunciation,'getVocabularyPronunciation').mockReturnValue({required:true,recordings:[audio]});
  state.play.mockResolvedValue({ok:false,reason:'sense-recording-failed',accent:'us'});
  try {
   render(<Pronunciation entry={record} sense={noun} accent="us"/>);
   await waitFor(()=>expect(screen.queryByText('Loading pronunciation details…')).toBeNull());
   expect(screen.getByRole('button',{name:'Play US pronunciation of record'}).textContent).toBe('Retry · US audio');
   fireEvent.click(screen.getByRole('button',{name:'Play US pronunciation of record'}));
   await waitFor(()=>expect(state.play).toHaveBeenCalledWith(record,expect.objectContaining({recording:audio,sense:noun})));
   expect(screen.getByRole('button',{name:'US — Speaker'})).toBeDefined();
   expect(screen.getByRole('status').textContent).toContain('could not play');
  } finally { lookup.mockRestore(); }
 });
 test('a source transcription without a regional label is not presented as UK or US',async()=>{
  const lookup=vi.spyOn(sensePronunciation,'getVocabularyPronunciation').mockReturnValue({required:true,recordings:[],group:{id:'general-reading',term:'refuse',scope:'fuse again',sourceUrl:'https://example.org/revision',ipa:{general:'/ɹiːˈfjuːz/'},audioMarkup:[],recordings:{}}});
  try {
   const view=render(<Pronunciation entry={{...entry,term:'refuse'}} accent="uk"/>);
   await waitFor(()=>expect(screen.queryByText('Loading pronunciation details…')).toBeNull());
   expect(screen.getByText('IPA /ɹiːˈfjuːz/')).toBeDefined();
   expect(screen.queryByText('UK /ɹiːˈfjuːz/')).toBeNull();
   view.rerender(<Pronunciation entry={{...entry,term:'refuse'}} accent="us"/>);
   expect(screen.getByText('IPA /ɹiːˈfjuːz/')).toBeDefined();
   expect(screen.queryByText('US /ɹiːˈfjuːz/')).toBeNull();
   expect(screen.getByRole('button',{name:'Play US pronunciation of refuse'}).textContent).toContain('No matched audio');
  } finally { lookup.mockRestore(); }
 });
 test('legacy history discloses its missing saved match even before playback succeeds',async()=>{
  state.load.mockResolvedValue({recordings:[]});state.play.mockResolvedValue({ok:false,source:'none',reason:'target-voice-unavailable',accent:'us'});
  render(<Pronunciation compact entry={record} sense={noun} accent="us" options={{pronunciation:'legacy'}}/>);
  expect(screen.getByText('Meaning match was not saved for this session.')).toBeDefined();
  fireEvent.click(screen.getByRole('button',{name:'Play US pronunciation of record'}));
  await waitFor(()=>expect(state.play).toHaveBeenCalledWith(record,expect.objectContaining({pronunciation:'legacy'})));
  expect(screen.queryByText(/matches this meaning/)).toBeNull();
 });
 test('an explicitly unresolved meaning does not fall back to the entry primary',async()=>{
  state.load.mockResolvedValue({recordings:[]});state.play.mockResolvedValue({ok:false,source:'none',reason:'sense-recording-unavailable',accent:'us'});
  render(<Pronunciation entry={record} sense={null} accent="us"/>);
  fireEvent.click(screen.getByRole('button',{name:'Play US pronunciation of record'}));
  await waitFor(()=>expect(state.play).toHaveBeenCalledWith(record,expect.objectContaining({sense:undefined})));
  expect(screen.queryByText('wrong entry IPA')).toBeNull();
 });
 test('same-entry meaning changes stop audio, clear stale status and pass the selected sense',async()=>{
  state.load.mockResolvedValue({recordings:[]});state.play.mockResolvedValue({ok:true,source:'recording',accent:'us',senseMatch:'matched'});
  const view=render(<Pronunciation entry={record} sense={noun} accent="us"/>);
  fireEvent.click(screen.getByRole('button',{name:'Play US pronunciation of record'}));
  await waitFor(()=>expect(state.play).toHaveBeenCalledWith(record,expect.objectContaining({sense:noun})));
  expect(screen.queryByText('wrong entry IPA')).toBeNull();
  view.rerender(<Pronunciation entry={record} sense={verb} accent="us"/>);
  expect(state.stop).toHaveBeenCalledOnce();expect(screen.queryByText(/Recorded pronunciation/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Play US pronunciation of record'}));
  await waitFor(()=>expect(state.play).toHaveBeenLastCalledWith(record,expect.objectContaining({sense:verb})));
 });
 test('compact missing-match recovery offers the same meaning in another accent and explicit unverified speech',async()=>{
  state.load.mockResolvedValue({recordings:[{url:'https://example.org/wrong-verb.ogg',accent:'us',status:'verified',author:'Wrong reading'}]});
  state.play.mockResolvedValueOnce({ok:false,source:'none',reason:'sense-recording-unavailable',accent:'uk'}).mockResolvedValue({ok:true,source:'speech',accent:'uk',senseMatch:'unverified',voice:'Device UK'});
  render(<Pronunciation compact entry={record} sense={noun}/>);
  fireEvent.click(screen.getByRole('button',{name:'Play UK pronunciation of record'}));
  expect(await screen.findByText(/No verified UK recording for this meaning/)).toBeDefined();
  expect(screen.getByRole('button',{name:'US — Dvortygirl'})).toBeDefined();
  expect(screen.queryByText(/Wrong reading/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Use UK device voice (reading unverified)'}));
  await waitFor(()=>expect(state.play).toHaveBeenLastCalledWith(record,expect.objectContaining({sense:noun,deviceOnly:true})));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('reading unverified'));
 });
 test('failure in the nonpreferred accent still offers the preferred matching recording',async()=>{
  state.load.mockResolvedValue({recordings:[]});state.play.mockResolvedValue({ok:false,source:'none',reason:'sense-recording-unavailable',accent:'uk'});
  render(<Pronunciation entry={record} sense={noun} accent="us"/>);
  fireEvent.click(screen.getByRole('button',{name:'Play UK pronunciation of record'}));
  expect(await screen.findByRole('button',{name:'US — Dvortygirl'})).toBeDefined();
 });
 test('delayed metadata retry ignores an older response and exposes a recoverable failure', async () => {
  vi.useFakeTimers();
  let finishOld!: (value: any) => void;
  state.load.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ recordings: [] });
  render(<Pronunciation entry={entry} />);
  expect(screen.getByRole('status').textContent).toBe('Loading pronunciation details…');
  expect(screen.queryByRole('button', { name: 'Retry media metadata' })).toBeNull();
  act(() => vi.advanceTimersByTime(10_000));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry media metadata' })));
  expect(screen.getByRole('alert').textContent).toContain('Pronunciation details could not be loaded.');
  await act(async () => finishOld({ recordings: [] }));
  expect(screen.getByRole('alert').textContent).toContain('Pronunciation details could not be loaded.');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry media metadata' })));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(state.load).toHaveBeenCalledTimes(3);
  expect(state.play).not.toHaveBeenCalled();
 });
 test('synthetic pronunciation describes word audio fallback without implying learner recording failure', () => {
  expect(playbackMessage({ok:true,source:'speech',accent:'uk',voice:'Google UK English Female',fallbackReason:'unavailable'})).toBe('UK synthetic voice · Google UK English Female');
 });
 test('requests explicit other recording and reports the actual accent', async () => {
  const other = { url: 'https://example.org/us.ogg', accent: 'us', status: 'verified', availability: 'metadata-only', author: 'Speaker' };
  state.load.mockResolvedValue({ recordings: [other] }); state.play.mockResolvedValueOnce({ok:false,reason:'target-voice-unavailable',accent:'uk'}).mockResolvedValue({ ok: true, source: 'recording', accent: 'us' });
  render(<Pronunciation entry={entry} accent="uk" />);
  fireEvent.click(screen.getByRole('button',{name:'Play UK pronunciation of vegetable'}));
  await waitFor(() => expect(screen.getByText('US — Speaker')).toBeDefined());
  fireEvent.click(screen.getByText('US — Speaker'));
  expect(state.play).toHaveBeenCalledWith(entry, expect.objectContaining({ accent: 'uk', recording: other }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('American · Recorded pronunciation'));
 });
 test('metadata failure is retryable and does not relabel an unknown accent', async () => {
  state.load.mockResolvedValueOnce({ recordings: [], loadError: true }).mockResolvedValueOnce({ recordings: [{ url: 'https://example.org/unknown.ogg', accent: 'unknown', status: 'unknown', author: 'Legacy', availability: 'network-unverified' }] });
  render(<Pronunciation entry={entry} />);
  fireEvent.click(await screen.findByText('Retry media metadata'));
  state.play.mockResolvedValueOnce({ok:false,reason:'target-voice-unavailable',accent:'uk'});
  fireEvent.click(screen.getByRole('button',{name:'Play UK pronunciation of vegetable'}));
  expect(await screen.findByText('Unverified accent — Legacy')).toBeDefined();
  expect(state.load).toHaveBeenCalledTimes(2); expect(state.play).toHaveBeenCalledTimes(1);
  state.play.mockResolvedValue({ ok: true, source: 'recording', accent: 'unknown' });
  fireEvent.click(screen.getByText('Unverified accent — Legacy'));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Unverified accent · Recorded pronunciation'));
 });
 test('unmount cancels its own player', async () => {
  state.load.mockResolvedValue({ recordings: [] }); const { unmount } = render(<Pronunciation entry={entry} />);
  unmount(); expect(state.stop).toHaveBeenCalledOnce();
 });
 test('an alternative after failed playback remains stoppable',async()=>{
  state.load.mockResolvedValue({recordings:[{url:'https://example.org/other.ogg',accent:'other',status:'verified',author:'Speaker'}]});
  let finish!:(result:any)=>void;
  state.play.mockResolvedValueOnce({ok:false,reason:'target-voice-unavailable',accent:'uk'}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(<Pronunciation entry={entry}/>);
  fireEvent.click(screen.getByRole('button',{name:'Play UK pronunciation of vegetable'}));
  fireEvent.click(await screen.findByRole('button',{name:'Other accent — Speaker'}));
  fireEvent.click(screen.getByRole('button',{name:'Stop Other accent — Speaker'}));
  expect(state.stop).toHaveBeenCalledOnce();
  await act(async()=>finish({ok:false,reason:'cancelled'}));
  expect(screen.getByRole('status').textContent).toBe('Stopped.');
 });
 test('a different alternative replaces playback; an active alternative click stops and stale completion cannot reset controls', async () => {
  const a = { url: 'https://example.org/us-a.ogg', accent: 'us', status: 'verified', availability: 'metadata-only', author: 'Speaker A' };
  const b = { ...a, url: 'https://example.org/us-b.ogg', author: 'Speaker B' };
  state.load.mockResolvedValue({ recordings: [a, b] });
  const completions: ((result: { ok: boolean; source: string; reason: string }) => void)[] = [];
  state.play.mockImplementation(() => new Promise(resolve => completions.push(resolve)));
  render(<Pronunciation entry={entry} />);
  await waitFor(()=>expect(screen.queryByText('Loading pronunciation details…')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Play UK pronunciation of vegetable' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play US pronunciation of vegetable' }));
  expect(state.play).toHaveBeenCalledTimes(2);
  expect(state.play).toHaveBeenLastCalledWith(entry, expect.objectContaining({ accent:'us' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play UK pronunciation of vegetable' }));
  expect(state.play).toHaveBeenCalledTimes(3);
  expect(state.play).toHaveBeenLastCalledWith(entry, expect.objectContaining({ accent:'uk' }));
  await act(async () => completions[1]({ ok: false, source: 'none', reason: 'cancelled' }));
  expect(screen.getByRole('button',{name:'Stop UK pronunciation of vegetable'})).toBeDefined();
  fireEvent.click(screen.getByRole('button',{name:'Stop UK pronunciation of vegetable'}));
  expect(state.stop).toHaveBeenCalledOnce();
  expect(state.play).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('status').textContent).toBe('Stopped.');
 });
});

 test('both accents are explicit without the audio options explanation', async () => {
  state.load.mockResolvedValue({recordings:[]});
  state.play.mockResolvedValue({ok:true,source:'speech',accent:'us',voice:'Device voice name',fallbackReason:'target-recording-unavailable'});
  const view=render(<Pronunciation entry={entry} accent="uk" />);
  fireEvent.click(screen.getByRole('button',{name:'Play US pronunciation of vegetable'}));
  expect(state.play).toHaveBeenCalledWith(entry,expect.objectContaining({accent:'us',recording:undefined}));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('American · Device voice'));
  expect(view.container.querySelector('details')).toBeNull();
  expect(screen.queryByText('Audio options & sources')).toBeNull();
  expect(screen.queryByText('US synthetic voice · Device voice name')).toBeNull();
 });
