import { useEffect, useMemo, useRef, useState } from 'react';
import { InlineLoadingState, StateMessage } from '../../components/AsyncState';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
import { getVocabularyMedia, type VocabularyAccent, type VocabularyRecording } from '../../domain/vocabulary/media';
import { createVocabularyPlayback, type VocabularyPlaybackOptions, type VocabularyPlaybackResult } from './playback';
import '../../styles/vocabulary-media.css';
export function playbackMessage(result: VocabularyPlaybackResult): string {
  if (result.ok) return result.source === 'speech' ? `${result.accent?.toUpperCase() || 'English'} synthetic voice · ${result.voice || 'name unavailable'}` : `${result.accent === 'other' ? 'Other accent' : result.accent === 'unknown' ? 'Unverified accent' : result.accent?.toUpperCase()} recording`;
  if (result.reason === 'cancelled') return 'Stopped.';
  if (result.reason === 'target-voice-unavailable') return `No ${result.accent?.toUpperCase()} voice is available on this device. Choose a matching voice in device settings or explicitly play another recording.`;
  if (result.reason === 'blocked') return 'Playback was blocked. Press Play again to retry.';
  return 'Playback unavailable. Press Play to retry.';
}
export function Pronunciation({ entry, accent = 'uk', options = {}, compact = false, onMedia }: { entry: VocabularyEntry; accent?: VocabularyAccent; options?: VocabularyPlaybackOptions; compact?: boolean; onMedia?: (recordings: VocabularyRecording[]) => void }) {
  const player = useMemo(() => createVocabularyPlayback(), []);
  const generation = useRef(0);
  const mediaRequest = useRef(0);
  const playAttempt = useRef(0);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  const [playback, setPlayback] = useState<VocabularyPlaybackResult | null>(null);
  const [others, setOthers] = useState<VocabularyRecording[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const load = async (token: number, retry = false) => {
    const request = ++mediaRequest.current;
    const current = () => token === generation.current && request === mediaRequest.current;
    setMediaLoading(true); setMediaError(false);
    try {
      const media = await getVocabularyMedia(entry, { retry });
      if (!current()) return;
      setMediaError(Boolean(media.loadError)); onMedia?.(media.recordings);
      setOthers(media.recordings.filter(recording => recording.accent !== accent && recording.status !== 'missing' && recording.availability !== 'failed' && recording.wordformConfirmed !== false));
    } catch { if (current()) setMediaError(true); }
    finally { if (current()) setMediaLoading(false); }
  };
  useEffect(() => {
    const token = ++generation.current; setOthers([]); setMessage(''); setFallback(''); setPlayback(null); setActiveAction(null); setMediaError(false); void load(token);
    return () => { generation.current += 1; playAttempt.current += 1; player.stop(); };
  }, [entry.id, accent, player]);
  const play = async (recording?: VocabularyRecording, requestedAccent = accent) => {
    const action = recording?.url || (requestedAccent === accent ? 'target' : `accent:${requestedAccent}`);
    const attempt = ++playAttempt.current;
    if (activeAction === action) { player.stop(); setActiveAction(null); setPlayback(null); setMessage('Stopped.'); return; }
    const token = generation.current; setActiveAction(action); setFallback(''); setMessage(''); setPlayback(null);
    const result = await player.play(entry, { ...options, accent: requestedAccent, recording });
    if (token !== generation.current || attempt !== playAttempt.current) return;
    setActiveAction(null); setPlayback(result); setMessage(playbackMessage(result));
    if (result.ok && result.source === 'speech' && result.fallbackReason) setFallback(result.fallbackReason === 'target-recording-unavailable' ? 'No recorded word pronunciation is available for this accent. Using your device’s synthetic voice.' : 'The recorded word pronunciation could not be played. Using your device’s synthetic voice.');
  };
  const visibleMessage = !compact && playback?.ok
    ? `${playback.accent === 'uk' ? 'British' : playback.accent === 'us' ? 'American' : playback.accent === 'other' ? 'Other accent' : 'Unverified accent'} · ${playback.source === 'speech' ? 'Device voice' : 'Recorded pronunciation'}`
    : message;
  return <div className={`vocabulary-pronunciation${compact ? ' is-compact' : ''}`}>
    <div className="vocabulary-pronunciation-actions" role="group" aria-label="Word pronunciation">
      {entry.pronunciation?.ipa && !compact ? <span className="vocabulary-ipa">{entry.pronunciation.ipa}</span> : null}
      {(compact ? [accent] : ['uk', 'us'] as const).map(target => {
        const action = target === accent ? 'target' : `accent:${target}`;
        return <button key={target} className="btn line" type="button" aria-label={`${activeAction === action ? 'Stop' : 'Play'} ${target.toUpperCase()} pronunciation of ${entry.term}`} onClick={() => void play(undefined, target)}>{activeAction === action ? 'Stop' : compact ? `Play ${target.toUpperCase()}` : target === 'uk' ? 'Listen · UK' : 'Listen · US'}</button>;
      })}
    </div>
    {visibleMessage ? <span role="status">{visibleMessage}</span> : null}
    {!compact && mediaLoading ? <InlineLoadingState message="Loading pronunciation details…" onRetry={() => void load(generation.current, true)} retryLabel="Retry media metadata" /> : null}
    {!compact && mediaError && <StateMessage inline kind="error" message="Pronunciation details could not be loaded." onRetry={() => void load(generation.current, true)} retryLabel="Retry media metadata" />}
    {!compact && <details className="vocabulary-audio-source" key={entry.id}><summary>Audio options &amp; sources</summary><p>UK is British English; US is American English. Recorded word audio is preferred. A device voice is used when a matching recording is unavailable.</p>{fallback ? <p>{fallback}</p> : null}{playback?.ok ? <p>{message}</p> : null}{others.length ? <><p>Alternative recordings</p>{others.map(recording => <button className="btn line" type="button" key={recording.url} onClick={() => void play(recording)}>{activeAction === recording.url ? 'Stop ' : ''}{recording.accent === 'unknown' ? 'Unverified accent' : recording.accent === 'other' ? 'Other accent' : recording.accent.toUpperCase()} — {recording.author || recording.title}</button>)}</> : null}</details>}
  </div>;
}
