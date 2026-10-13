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
    const token = ++generation.current; setOthers([]); setMessage(''); setFallback(''); setActiveAction(null); setMediaError(false); void load(token);
    return () => { generation.current += 1; playAttempt.current += 1; player.stop(); };
  }, [entry.id, accent, player]);
  const play = async (recording?: VocabularyRecording) => {
    const action = recording?.url || 'target';
    const attempt = ++playAttempt.current;
    if (activeAction === action) { player.stop(); setActiveAction(null); setMessage('Stopped.'); return; }
    const token = generation.current; setActiveAction(action); setFallback('');
    const result = await player.play(entry, { ...options, accent, recording });
    if (token !== generation.current || attempt !== playAttempt.current) return;
    setActiveAction(null); setMessage(playbackMessage(result));
    if (result.ok && result.source === 'speech' && result.fallbackReason) setFallback(result.fallbackReason === 'target-recording-unavailable' ? 'No recorded word pronunciation is available for this accent. Using your device’s synthetic voice.' : 'The recorded word pronunciation could not be played. Using your device’s synthetic voice.');
  };
  return <div className={`vocabulary-pronunciation${compact ? ' is-compact' : ''}`}>
    <button className="btn line" type="button" aria-label={`${activeAction === 'target' ? 'Stop' : 'Play'} ${accent.toUpperCase()} pronunciation of ${entry.term}`} onClick={() => void play()}>{activeAction === 'target' ? 'Stop' : `Play ${accent.toUpperCase()}`}</button>
    {message ? <span role="status">{message}</span> : null}
    {!compact && mediaLoading ? <InlineLoadingState message="Loading pronunciation details…" onRetry={() => void load(generation.current, true)} retryLabel="Retry media metadata" /> : null}
    {!compact && fallback && <details className="vocabulary-audio-source"><summary>About this pronunciation</summary><p>{fallback}</p></details>}
    {!compact && mediaError && <StateMessage inline kind="error" message="Pronunciation details could not be loaded." onRetry={() => void load(generation.current, true)} retryLabel="Retry media metadata" />}
    {!compact && others.length > 0 && <details><summary>Other recordings (explicit choice)</summary>{others.map(recording => <button className="btn line" type="button" key={recording.url} onClick={() => void play(recording)}>{activeAction === recording.url ? 'Stop ' : ''}{recording.accent === 'unknown' ? 'Unverified accent' : recording.accent === 'other' ? 'Other accent' : recording.accent.toUpperCase()} — {recording.author || recording.title}</button>)}</details>}
  </div>;
}
