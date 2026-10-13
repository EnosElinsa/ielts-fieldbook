import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Pronunciation, playbackMessage } from './Pronunciation';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
const state = vi.hoisted(() => ({ load: vi.fn(), play: vi.fn(), stop: vi.fn() }));
vi.mock('../../domain/vocabulary/media', () => ({ getVocabularyMedia: state.load }));
vi.mock('./playback', () => ({ createVocabularyPlayback: () => ({ play: state.play, stop: state.stop }) }));
const entry = { id: 'example', term: 'vegetable' } as VocabularyEntry;
beforeEach(() => { state.load.mockReset(); state.play.mockReset(); state.stop.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('pronunciation controls', () => {
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
