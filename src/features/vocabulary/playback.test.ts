import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createVocabularyPlayback } from './playback';
import type { VocabularyEntry } from '../../domain/vocabulary/types';

class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playbackRate = 1;
  volume = 1;
  paused = false;
  src: string;
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this); }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(text: string) { this.text = text; }
}
let utterances: FakeUtterance[];
const entry = { id: 'term', term: 'significant', example: 'A significant change.', pronunciation: { uk: 'https://example.com/uk.mp3', us: 'https://example.com/us.mp3' } } as VocabularyEntry;

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.instances = [];
  utterances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], speak: (utterance: FakeUtterance) => utterances.push(utterance), cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('vocabulary playback', () => {
  test('plays the selected recording with saved speed, volume and automatic repetitions', async () => {
    const controller = createVocabularyPlayback();
    const result = controller.play(entry, { accent: 'us', rate: 0.8, volume: 0.4, repeatCount: 2, repeatGapMs: 800 });
    expect(FakeAudio.instances[0]).toMatchObject({ src: 'https://example.com/us.mp3', playbackRate: 0.8, volume: 0.4 });
    FakeAudio.instances[0].onended!();
    await vi.advanceTimersByTimeAsync(799);
    expect(FakeAudio.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeAudio.instances).toHaveLength(2);
    FakeAudio.instances[1].onended!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'recording' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('falls back to browser speech when a recording fails, including browsers whose voice list is not loaded', async () => {
    const controller = createVocabularyPlayback();
    const result = controller.play(entry, { accent: 'uk', rate: 1.2, volume: 0.3 });
    FakeAudio.instances[0].onerror!();
    await vi.advanceTimersByTimeAsync(250);
    expect(utterances[0]).toMatchObject({ text: 'significant', lang: 'en-GB', rate: 1.2, volume: 0.3 });
    utterances[0].onend!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'speech' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('speaks explicit example text without playing the word recording', async () => {
    const controller = createVocabularyPlayback();
    const result = controller.play(entry, { accent: 'us', text: 'A significant change.', rate: 1.1, volume: 0.8 });
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(utterances[0]).toMatchObject({ text: 'A significant change.', lang: 'en-US', rate: 1.1, volume: 0.8 });
    utterances[0].onend!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'speech' });
  });

  test('stopping playback resolves its promise and prevents a delayed repeated word', async () => {
    const controller = createVocabularyPlayback();
    const result = controller.play(entry, { repeatCount: 2, repeatGapMs: 800 });
    FakeAudio.instances[0].onended!();
    await vi.advanceTimersByTimeAsync(100);
    controller.stop();
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('replacing active playback cancels stale completion handlers', async () => {
    const controller = createVocabularyPlayback();
    const first = controller.play(entry);
    const staleEnd = FakeAudio.instances[0].onended!;
    const second = controller.play(entry, { accent: 'us' });
    await expect(first).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    expect(FakeAudio.instances[0].paused).toBe(true);
    staleEnd();
    FakeAudio.instances[1].onended!();
    await expect(second).resolves.toMatchObject({ ok: true, source: 'recording' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('surfaces blocked playback so the interface can request another user gesture', async () => {
    vi.spyOn(FakeAudio.prototype, 'play').mockRejectedValue(new DOMException('User gesture required.', 'NotAllowedError'));
    const controller = createVocabularyPlayback();
    await expect(controller.play(entry)).resolves.toMatchObject({ ok: false, reason: 'blocked' });
    expect(utterances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('times out a browser that never reports audio completion', async () => {
    const controller = createVocabularyPlayback();
    const result = controller.play(entry);
    await vi.advanceTimersByTimeAsync(20000);
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'timeout' });
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('cancels browser speech and resolves it when the owner unmounts', async () => {
    const cancel = vi.spyOn(speechSynthesis, 'cancel');
    const controller = createVocabularyPlayback();
    const result = controller.play({ ...entry, pronunciation: undefined });
    await vi.advanceTimersByTimeAsync(250);
    controller.stop();
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    expect(cancel).toHaveBeenCalled();
    expect(utterances[0].onend).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
