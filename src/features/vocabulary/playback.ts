import type { VocabularyEntry } from '../../domain/vocabulary/types';

export type VocabularyPlaybackOptions = {
  accent?: 'uk' | 'us'; rate?: number; volume?: number; repeatCount?: number; repeatGapMs?: number;
  example?: boolean | string; text?: string;
};
export type VocabularyPlaybackResult = { ok: boolean; source: 'recording' | 'speech' | 'none'; reason?: string };
export function createVocabularyPlayback(): { play(entry: VocabularyEntry, options?: VocabularyPlaybackOptions): Promise<VocabularyPlaybackResult>; stop(): void } {
  let generation = 0;
  let cancelStep: (() => void) | null = null;
  let cancelPlay: (() => void) | null = null;
  const cancelled = (): VocabularyPlaybackResult => ({ ok: false, source: 'none', reason: 'cancelled' });
  const stop = () => {
    generation += 1;
    const step = cancelStep; const play = cancelPlay;
    cancelStep = null; cancelPlay = null;
    step?.(); play?.();
  };
  const bound = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

  function recording(url: string, rate: number, volume: number, token: number): Promise<VocabularyPlaybackResult> {
    return new Promise(resolve => {
      if (token !== generation) { resolve(cancelled()); return; }
      let audio: HTMLAudioElement;
      try { audio = new Audio(url); } catch { resolve({ ok: false, source: 'none', reason: 'unavailable' }); return; }
      let settled = false;
      const finish = (result: VocabularyPlaybackResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.onended = null; audio.onerror = null;
        try { audio.pause(); } catch { /* The browser may already have detached the media. */ }
        if (cancelStep === cancel) cancelStep = null;
        resolve(result);
      };
      const cancel = () => finish(cancelled());
      const timer = setTimeout(() => finish({ ok: false, source: 'none', reason: 'timeout' }), 20000);
      cancelStep = cancel;
      audio.playbackRate = rate; audio.volume = volume;
      audio.onended = () => finish(token === generation ? { ok: true, source: 'recording' } : cancelled());
      audio.onerror = () => finish({ ok: false, source: 'none', reason: 'failed' });
      try {
        const attempt = audio.play();
        attempt?.catch(error => finish({ ok: false, source: 'none', reason: error?.name === 'NotAllowedError' ? 'blocked' : 'failed' }));
      } catch (error) {
        finish({ ok: false, source: 'none', reason: error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'failed' });
      }
    });
  }

  function speech(text: string, accent: 'uk' | 'us', rate: number, volume: number, token: number): Promise<VocabularyPlaybackResult> {
    return new Promise(resolve => {
      if (token !== generation) { resolve(cancelled()); return; }
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') { resolve({ ok: false, source: 'none', reason: 'unavailable' }); return; }
      const synth = speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = accent === 'uk' ? 'en-GB' : 'en-US';
      utterance.rate = rate; utterance.volume = volume;
      // Browsers load their voice list asynchronously; the language also works before voiceschanged.
      try { utterance.voice = synth.getVoices().find(voice => voice.lang.toLowerCase() === utterance.lang.toLowerCase()) || synth.getVoices().find(voice => /^en[-_]/i.test(voice.lang)) || null; } catch { utterance.voice = null; }
      let settled = false;
      const finish = (result: VocabularyPlaybackResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        utterance.onend = null; utterance.onerror = null;
        if (!result.ok) { try { synth.cancel(); } catch { /* Some browsers expose a disabled synthesis service. */ } }
        if (cancelStep === cancel) cancelStep = null;
        resolve(result);
      };
      const cancel = () => finish(cancelled());
      const timer = setTimeout(() => finish({ ok: false, source: 'none', reason: 'timeout' }), 20000);
      cancelStep = cancel;
      utterance.onend = () => finish(token === generation ? { ok: true, source: 'speech' } : cancelled());
      utterance.onerror = event => finish({ ok: false, source: 'none', reason: event.error === 'not-allowed' ? 'blocked' : 'failed' });
      try { synth.speak(utterance); } catch { finish({ ok: false, source: 'none', reason: 'failed' }); }
    });
  }

  function gap(milliseconds: number, token: number): Promise<boolean> {
    if (token !== generation) return Promise.resolve(false);
    if (!milliseconds) return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (cancelStep === cancel) cancelStep = null;
        resolve(ok);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(() => finish(token === generation), milliseconds);
      cancelStep = cancel;
    });
  }

  function play(entry: VocabularyEntry, options: VocabularyPlaybackOptions = {}): Promise<VocabularyPlaybackResult> {
    stop();
    const token = generation;
    const rate = bound(options.rate, 1, 0.5, 1.5); const volume = bound(options.volume, 1, 0, 1);
    const count = Math.floor(bound(options.repeatCount, 1, 1, 5));
    const repeatGapMs = bound(options.repeatGapMs, 800, 0, 5000);
    const accent = options.accent === 'us' ? 'us' : 'uk';
    const example = typeof options.example === 'string' ? options.example : options.example ? entry.example : undefined;
    const text = (options.text || example || entry.term || '').trim();
    const url = !options.text && !example ? entry.pronunciation?.[accent] : undefined;
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: VocabularyPlaybackResult) => {
        if (settled) return;
        settled = true;
        if (cancelPlay === cancel) cancelPlay = null;
        resolve(result);
      };
      const cancel = () => finish(cancelled());
      cancelPlay = cancel;
      const run = async () => {
        if (!text) { finish({ ok: false, source: 'none', reason: 'unavailable' }); return; }
        let last: VocabularyPlaybackResult = { ok: false, source: 'none', reason: 'unavailable' };
        for (let index = 0; index < count; index += 1) {
          if (token !== generation) { finish(cancelled()); return; }
          last = url ? await recording(url, rate, volume, token) : { ok: false, source: 'none', reason: 'unavailable' };
          if (!last.ok && !['cancelled', 'blocked', 'timeout'].includes(last.reason || '')) last = await speech(text, accent, rate, volume, token);
          if (!last.ok) { finish(last); return; }
          if (index + 1 < count && !await gap(repeatGapMs, token)) { finish(cancelled()); return; }
        }
        finish(token === generation ? last : cancelled());
      };
      void run().catch(() => { const step = cancelStep; cancelStep = null; step?.(); finish({ ok: false, source: 'none', reason: 'failed' }); });
    });
  }
  return { play, stop };
}
