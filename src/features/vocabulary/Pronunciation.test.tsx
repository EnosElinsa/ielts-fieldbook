import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Pronunciation } from './Pronunciation';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
const state = vi.hoisted(() => ({ load: vi.fn(), play: vi.fn(), stop: vi.fn() }));
vi.mock('../../domain/vocabulary/media', () => ({ getVocabularyMedia: state.load }));
vi.mock('./playback', () => ({ createVocabularyPlayback: () => ({ play: state.play, stop: state.stop }) }));
const entry = { id: 'example', term: 'vegetable' } as VocabularyEntry;
beforeEach(() => { state.load.mockReset(); state.play.mockReset(); state.stop.mockReset(); });
afterEach(cleanup);
describe('pronunciation controls', () => {
 test('requests explicit other recording and reports the actual accent', async () => {
  const other = { url: 'https://example.org/us.ogg', accent: 'us', status: 'verified', availability: 'metadata-only', author: 'Speaker' };
  state.load.mockResolvedValue({ recordings: [other] }); state.play.mockResolvedValue({ ok: true, source: 'recording', accent: 'us' });
  render(<Pronunciation entry={entry} accent="uk" />);
  await waitFor(() => expect(screen.getByText('US — Speaker')).toBeDefined());
  fireEvent.click(screen.getByText('US — Speaker'));
  expect(state.play).toHaveBeenCalledWith(entry, expect.objectContaining({ accent: 'uk', recording: other }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('US recording'));
 });
 test('metadata failure is retryable and does not relabel an unknown accent', async () => {
  state.load.mockResolvedValueOnce({ recordings: [], loadError: true }).mockResolvedValueOnce({ recordings: [{ url: 'https://example.org/unknown.ogg', accent: 'unknown', status: 'unknown', author: 'Legacy', availability: 'network-unverified' }] });
  render(<Pronunciation entry={entry} />);
  fireEvent.click(await screen.findByText('Retry media metadata'));
  expect(await screen.findByText('Unverified accent — Legacy')).toBeDefined();
  expect(state.load).toHaveBeenCalledTimes(2); expect(state.play).not.toHaveBeenCalled();
 });
 test('unmount cancels its own player', async () => {
  state.load.mockResolvedValue({ recordings: [] }); const { unmount } = render(<Pronunciation entry={entry} />);
  unmount(); expect(state.stop).toHaveBeenCalledOnce();
 });
 test('a different alternative replaces playback; an active alternative click stops and stale completion cannot reset controls', async () => {
  const a = { url: 'https://example.org/us-a.ogg', accent: 'us', status: 'verified', availability: 'metadata-only', author: 'Speaker A' };
  const b = { ...a, url: 'https://example.org/us-b.ogg', author: 'Speaker B' };
  state.load.mockResolvedValue({ recordings: [a, b] });
  const completions: ((result: { ok: boolean; source: string; reason: string }) => void)[] = [];
  state.play.mockImplementation(() => new Promise(resolve => completions.push(resolve)));
  render(<Pronunciation entry={entry} />);
  await screen.findByText('US — Speaker A');
  fireEvent.click(screen.getByRole('button', { name: 'Play UK pronunciation of vegetable' }));
  fireEvent.click(screen.getByText('US — Speaker A'));
  expect(state.play).toHaveBeenCalledTimes(2);
  expect(state.play).toHaveBeenLastCalledWith(entry, expect.objectContaining({ recording: a }));
  fireEvent.click(screen.getByText('US — Speaker B'));
  expect(state.play).toHaveBeenCalledTimes(3);
  expect(state.play).toHaveBeenLastCalledWith(entry, expect.objectContaining({ recording: b }));
  await act(async () => completions[1]({ ok: false, source: 'none', reason: 'cancelled' }));
  expect(screen.getByText('Stop US — Speaker B')).toBeDefined();
  fireEvent.click(screen.getByText('Stop US — Speaker B'));
  expect(state.stop).toHaveBeenCalledOnce();
  expect(state.play).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('status').textContent).toBe('Stopped.');
 });
});
