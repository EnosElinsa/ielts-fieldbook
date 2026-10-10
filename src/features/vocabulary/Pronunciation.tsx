import { useEffect, useMemo, useRef, useState } from 'react';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
import { getVocabularyMedia, type VocabularyAccent, type VocabularyRecording } from '../../domain/vocabulary/media';
import { createVocabularyPlayback, type VocabularyPlaybackOptions, type VocabularyPlaybackResult } from './playback';
import '../../styles/vocabulary-media.css';
export function playbackMessage(result: VocabularyPlaybackResult): string {
  if (result.ok) return result.source === 'speech' ? `${result.accent?.toUpperCase()} device voice: ${result.voice}${result.fallbackReason ? ' (recording unavailable)' : ''}` : `${result.accent === 'other' ? 'Other accent' : result.accent === 'unknown' ? 'Unverified accent' : result.accent?.toUpperCase()} recording`;
  if (result.reason === 'cancelled') return 'Stopped.';
  if (result.reason === 'target-voice-unavailable') return `No ${result.accent?.toUpperCase()} voice is available on this device. Choose a matching voice in device settings or explicitly play another recording.`;
  if (result.reason === 'blocked') return 'Playback was blocked. Press Play again to retry.';
  return 'Playback unavailable. Press Play to retry.';
}
export function Pronunciation({ entry, accent = 'uk', options = {}, compact = false }: { entry: VocabularyEntry; accent?: VocabularyAccent; options?: VocabularyPlaybackOptions; compact?: boolean }) {
  const player = useMemo(() => createVocabularyPlayback(), []);
  const generation = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [others, setOthers] = useState<VocabularyRecording[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const load = async (token: number) => {
    const media = await getVocabularyMedia(entry);
    if (token !== generation.current) return;
    setMediaError(Boolean(media.loadError));
    setOthers(media.recordings.filter(recording => recording.accent !== accent && recording.status !== 'missing' && recording.availability !== 'failed' && recording.wordformConfirmed !== false));
  };
  useEffect(() => {
    const token = ++generation.current; setOthers([]); setMessage(''); setPlaying(false); setMediaError(false); void load(token);
    return () => { generation.current += 1; player.stop(); };
  }, [entry.id, accent, player]);
  const play = async (recording?: VocabularyRecording) => {
    if (playing) { player.stop(); setPlaying(false); return; }
    const token = generation.current; setPlaying(true);
    const result = await player.play(entry, { ...options, accent, recording });
    if (token !== generation.current) return;
    setPlaying(false); setMessage(playbackMessage(result));
  };
  return <div className={`vocabulary-pronunciation${compact ? ' is-compact' : ''}`}>
    <button type="button" aria-label={`${playing ? 'Stop' : 'Play'} ${accent.toUpperCase()} pronunciation of ${entry.term}`} onClick={() => void play()}>{playing ? 'Stop' : `Play ${accent.toUpperCase()}`}</button>
    <span role="status">{message}</span>
    {!compact && mediaError && <button type="button" onClick={() => void load(generation.current)}>Retry media metadata</button>}
    {!compact && others.length > 0 && <details><summary>Other recordings (explicit choice)</summary>{others.map(recording => <button type="button" key={recording.url} onClick={() => void play(recording)}>{recording.accent === 'unknown' ? 'Unverified accent' : recording.accent === 'other' ? 'Other accent' : recording.accent.toUpperCase()} — {recording.author || recording.title}</button>)}</details>}
  </div>;
}
