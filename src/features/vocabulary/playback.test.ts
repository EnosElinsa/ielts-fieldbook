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
const voice = (lang: string, name = lang) => ({ lang, name, voiceURI: name, default: false } as SpeechSynthesisVoice);
const recordings = ['uk', 'us'].map(accent => ({ accent, url: `https://example.com/${accent}.mp3`, status: 'verified', availability: 'metadata-only', title: accent, author: 'Tester', sourceUrl: '', license: 'CC0', licenseUrl: '', changes: '', reason: 'test' } as import('../../domain/vocabulary/media').VocabularyRecording));
const controllerFor = () => createVocabularyPlayback(async entry => ({ version: 'test', recordings: entry.pronunciation ? recordings : [] }));
const entry = { id: 'term', term: 'significant', example: 'A significant change.', pronunciation: { uk: 'https://example.com/uk.mp3', us: 'https://example.com/us.mp3' } } as VocabularyEntry;

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.instances = [];
  utterances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', { getVoices: () => [voice('en-GB'), voice('en-US')], speak: (utterance: FakeUtterance) => utterances.push(utterance), cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('vocabulary playback', () => {
  test('plays the selected recording with saved speed, volume and automatic repetitions', async () => {
    const controller = controllerFor();
    const result = controller.play(entry, { accent: 'us', rate: 0.8, volume: 0.4, repeatCount: 2, repeatGapMs: 800 });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.instances[0]).toMatchObject({ src: 'https://example.com/us.mp3', playbackRate: 0.8, volume: 0.4 });
    await vi.advanceTimersByTimeAsync(0);
    FakeAudio.instances[0].onended!();
    await vi.advanceTimersByTimeAsync(799);
    expect(FakeAudio.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeAudio.instances).toHaveLength(2);
    FakeAudio.instances[1].onended!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'recording' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('falls back to browser speech when a recording fails, using an exact regional voice', async () => {
    const controller = controllerFor();
    const result = controller.play(entry, { accent: 'uk', rate: 1.2, volume: 0.3 });
    await vi.advanceTimersByTimeAsync(0);
    FakeAudio.instances[0].onerror!();
    await vi.advanceTimersByTimeAsync(250);
    expect(utterances[0]).toMatchObject({ text: 'significant', lang: 'en-GB', rate: 1.2, volume: 0.3 });
    utterances[0].onend!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'speech' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('speaks explicit example text without playing the word recording', async () => {
    const controller = controllerFor();
    const result = controller.play(entry, { accent: 'us', text: 'A significant change.', rate: 1.1, volume: 0.8 });
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(utterances[0]).toMatchObject({ text: 'A significant change.', lang: 'en-US', rate: 1.1, volume: 0.8 });
    utterances[0].onend!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'speech' });
    expect((await result).fallbackReason).toBeUndefined();
  });

  test.each([{ deviceOnly: true }, { example: true }])('intentional speech does not report a missing recording: %j', async options => {
    const controller = controllerFor();
    const result = controller.play(entry, options);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.instances).toHaveLength(0);
    utterances[0].onend!();
    expect(await result).toMatchObject({ ok: true, source: 'speech' });
    expect((await result).fallbackReason).toBeUndefined();
  });

  test('stopping playback resolves its promise and prevents a delayed repeated word', async () => {
    const controller = controllerFor();
    const result = controller.play(entry, { repeatCount: 2, repeatGapMs: 800 });
    await vi.advanceTimersByTimeAsync(0);
    FakeAudio.instances[0].onended!();
    await vi.advanceTimersByTimeAsync(100);
    controller.stop();
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('replacing active playback cancels stale completion handlers', async () => {
    const controller = controllerFor();
    const first = controller.play(entry);
    await vi.advanceTimersByTimeAsync(0);
    const staleEnd = FakeAudio.instances[0].onended!;
    const second = controller.play(entry, { accent: 'us' });
    await expect(first).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    expect(FakeAudio.instances[0].paused).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    staleEnd();
    FakeAudio.instances[1].onended!();
    await expect(second).resolves.toMatchObject({ ok: true, source: 'recording' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('surfaces blocked playback so the interface can request another user gesture', async () => {
    vi.spyOn(FakeAudio.prototype, 'play').mockRejectedValue(new DOMException('User gesture required.', 'NotAllowedError'));
    const controller = controllerFor();
    const result = controller.play(entry);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'blocked' });
    expect(utterances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('falls back to the target device voice after a recording timeout', async () => {
    const controller = controllerFor();
    const result = controller.play(entry);
    await vi.advanceTimersByTimeAsync(20000);
    expect(utterances).toHaveLength(1);
    utterances[0].onend!();
    await expect(result).resolves.toMatchObject({ ok: true, source: 'speech', accent: 'uk', fallbackReason: 'recording-timeout' });
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('cancels browser speech and resolves it when the owner unmounts', async () => {
    const cancel = vi.spyOn(speechSynthesis, 'cancel');
    const controller = controllerFor();
    const result = controller.play({ ...entry, pronunciation: undefined });
    await vi.advanceTimersByTimeAsync(250);
    controller.stop();
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'cancelled' });
    expect(cancel).toHaveBeenCalled();
    expect(utterances[0].onend).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('never silently uses US speech for UK when a matching voice is absent', async () => {
    vi.spyOn(speechSynthesis, 'getVoices').mockReturnValue([voice('en-US')]);
    const result = controllerFor().play({ ...entry, pronunciation: undefined }, { accent: 'uk' });
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'target-voice-unavailable', accent: 'uk' });
    expect(utterances).toHaveLength(0);
  });
  test('waits for asynchronously loaded matching voices', async () => {
    const get = vi.spyOn(speechSynthesis, 'getVoices').mockReturnValue([]);
    let changed: (() => void) | undefined;
    vi.spyOn(speechSynthesis, 'addEventListener').mockImplementation((_event, handler) => { changed = handler as () => void; });
    const result = controllerFor().play({ ...entry, pronunciation: undefined });
    await vi.advanceTimersByTimeAsync(0);
    expect(utterances).toHaveLength(0);
    get.mockReturnValue([voice('en-GB', 'UK test voice')]); changed!();
    await vi.advanceTimersByTimeAsync(0);
    utterances[0].onend!();
    await expect(result).resolves.toMatchObject({ ok: true, accent: 'uk', voice: 'UK test voice' });
  });
  test('coordinates distinct owners and an old unmount does not cancel the new speech', async () => {
    const first = controllerFor(), second = controllerFor();
    const old = first.play({ ...entry, pronunciation: undefined });
    await vi.advanceTimersByTimeAsync(0);
    const next = second.play({ ...entry, pronunciation: undefined }, { accent: 'us' });
    await vi.advanceTimersByTimeAsync(0);
    await expect(old).resolves.toMatchObject({ reason: 'cancelled' });
    const cancel = vi.spyOn(speechSynthesis, 'cancel');
    first.stop(); expect(cancel).not.toHaveBeenCalled();
    utterances[1].onend!(); await expect(next).resolves.toMatchObject({ ok: true, accent: 'us' });
  });
  test('does not play an unverified legacy recording automatically', async () => {
    const player = createVocabularyPlayback(async () => ({ version: 'test', recordings: [{ ...recordings[0], accent: 'unknown', status: 'unknown' }] }));
    const result = player.play(entry); await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.instances).toHaveLength(0); utterances[0].onend!(); await expect(result).resolves.toMatchObject({ source: 'speech' });
  });
  test('an explicit other recording reports its actual accent', async () => {
    const result = controllerFor().play(entry, { accent: 'uk', recording: recordings[1] });
    await vi.advanceTimersByTimeAsync(0); FakeAudio.instances[0].onended!();
    await expect(result).resolves.toMatchObject({ source: 'recording', accent: 'us' });
  });
  test('stopping while voices load prevents delayed speech', async () => {
    vi.spyOn(speechSynthesis, 'getVoices').mockReturnValue([]);
    const player = controllerFor(); const result = player.play({ ...entry, pronunciation: undefined });
    await vi.advanceTimersByTimeAsync(0); player.stop(); await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toMatchObject({ reason: 'cancelled' }); expect(utterances).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });

  test('a stale metadata failure cannot cancel the replacement playback', async () => {
    let reject: (error: Error) => void = () => {};
    let calls = 0;
    const player = createVocabularyPlayback(async () => { calls += 1; if (calls === 1) return new Promise((_resolve, failure) => { reject = failure; }); return { version: 'test', recordings }; });
    const old = player.play(entry); const next = player.play(entry, { accent: 'us' });
    await vi.advanceTimersByTimeAsync(0); reject(new Error('Late failure')); await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.instances[0].paused).toBe(false);
    FakeAudio.instances[0].onended!(); await expect(next).resolves.toMatchObject({ ok: true, accent: 'us' }); await expect(old).resolves.toMatchObject({ reason: 'cancelled' });
  });
});
