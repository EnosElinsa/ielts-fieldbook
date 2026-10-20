import { useEffect, useMemo, useRef, useState } from 'react';
import { InlineLoadingState, StateMessage } from '../../components/AsyncState';
import type { VocabularyEntry, VocabularySense } from '../../domain/vocabulary/types';
import { getVocabularyMedia, type VocabularyAccent, type VocabularyRecording } from '../../domain/vocabulary/media';
import { getVocabularyPronunciation } from '../../domain/vocabulary/sensePronunciation';
import { createVocabularyPlayback, type VocabularyPlaybackOptions, type VocabularyPlaybackResult } from './playback';
import '../../styles/vocabulary-media.css';
export function playbackMessage(result: VocabularyPlaybackResult): string {
  const match = result.senseMatch === 'matched' ? ' · matches this meaning' : result.senseMatch === 'unverified' ? ' · reading unverified' : result.senseMatch === 'legacy' ? ' · meaning match not saved' : '';
  if (result.ok) return (result.source === 'speech' ? `${result.accent?.toUpperCase() || 'English'} synthetic voice · ${result.voice || 'name unavailable'}` : `${result.accent === 'other' ? 'Other accent' : result.accent === 'unknown' ? 'Unverified accent' : result.accent?.toUpperCase()} recording`) + match;
  if (result.reason === 'cancelled') return 'Stopped.';
  if (result.reason === 'sense-recording-unavailable') return `No verified ${result.accent?.toUpperCase()} recording for this meaning. Choose a matching recording below or use device voice with an unverified reading.`;
  if (result.reason === 'sense-recording-failed') return `The matching ${result.accent?.toUpperCase()} recording could not play. Retry, or use device voice with an unverified reading.`;
  if (result.reason === 'target-voice-unavailable') return `No ${result.accent?.toUpperCase()} voice is available on this device. Choose a matching voice in device settings or explicitly play another recording.`;
  if (result.reason === 'blocked') return 'Playback was blocked. Press Play again to retry.';
  return 'Playback unavailable. Press Play to retry.';
}
export function Pronunciation({ entry, sense: selectedSense, accent = 'uk', options = {}, compact = false, onMedia }: { entry: VocabularyEntry; sense?: VocabularySense | null; accent?: VocabularyAccent; options?: VocabularyPlaybackOptions; compact?: boolean; onMedia?: (recordings: VocabularyRecording[]) => void }) {
  const sense = selectedSense === null ? undefined : selectedSense || entry.senses?.[0];
  const pronunciation = getVocabularyPronunciation(entry, sense, options.pronunciation);
  const readingSensitive = getVocabularyPronunciation(entry, sense).required;
  const meaningKey = JSON.stringify([entry.id,entry.term,sense?.id,sense?.definition,sense?.pos,sense?.source,options.pronunciation]);
  const player = useMemo(() => createVocabularyPlayback(), []);
  const generation = useRef(0);
  const mediaRequest = useRef(0);
  const playAttempt = useRef(0);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [playback, setPlayback] = useState<VocabularyPlaybackResult | null>(null);
  const [others, setOthers] = useState<VocabularyRecording[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const load = async (token: number, retry = false) => {
    const request = ++mediaRequest.current;
    const current = () => token === generation.current && request === mediaRequest.current;
    setMediaLoading(true); setMediaError(false);
    try {
      const media = pronunciation.required ? { recordings: pronunciation.recordings, loadError: false } : await getVocabularyMedia(entry, { retry });
      if (!current()) return;
      setMediaError(Boolean(media.loadError)); onMedia?.(media.recordings);
      setOthers(media.recordings.filter(recording => (pronunciation.required || recording.accent !== accent) && recording.status !== 'missing' && (recording.availability !== 'failed' || recording.status === 'verified' && recording.wordformConfirmed === true) && recording.wordformConfirmed !== false));
    } catch { if (current()) setMediaError(true); }
    finally { if (current()) setMediaLoading(false); }
  };
  useEffect(() => {
    const token = ++generation.current; setOthers([]); setMessage(''); setPlayback(null); setActiveAction(null); setMediaError(false); void load(token);
    return () => { generation.current += 1; playAttempt.current += 1; player.stop(); };
  }, [meaningKey, accent, player]);
  const play = async (recording?: VocabularyRecording, requestedAccent = accent, deviceOnly = false) => {
    const action = deviceOnly ? `device:${requestedAccent}` : recording?.url || (requestedAccent === accent ? 'target' : `accent:${requestedAccent}`);
    const attempt = ++playAttempt.current;
    if (activeAction === action) { player.stop(); setActiveAction(null); setPlayback(null); setMessage('Stopped.'); return; }
    const token = generation.current; setActiveAction(action); setMessage(''); setPlayback(null);
    const result = await player.play(entry, { ...options, sense, accent: requestedAccent, recording, deviceOnly: deviceOnly || options.deviceOnly });
    if (token !== generation.current || attempt !== playAttempt.current) return;
    setActiveAction(null); setPlayback(result); setMessage(playbackMessage(result));
  };
  const visibleMessage = !compact && playback?.ok
    ? `${playback.accent === 'uk' ? 'British' : playback.accent === 'us' ? 'American' : playback.accent === 'other' ? 'Other accent' : 'Unverified accent'} · ${playback.source === 'speech' ? 'Device voice' : 'Recorded pronunciation'}${playback.senseMatch === 'matched' ? ' · matches this meaning' : playback.senseMatch === 'unverified' ? ' · reading unverified' : playback.senseMatch === 'legacy' && readingSensitive ? ' · meaning match not saved' : ''}`
    : message;
  const recovery = Boolean(playback && !playback.ok && playback.reason !== 'cancelled' || others.some(recording => recording.url === activeAction) || activeAction?.startsWith('device:') || playback?.senseMatch === 'unverified');
  const regionalIpa = pronunciation.group?.ipa[accent];
  const generalIpa = pronunciation.group?.ipa.general;
  const ipa = regionalIpa || generalIpa || (!readingSensitive ? entry.pronunciation?.ipa : undefined);
  return <div className={`vocabulary-pronunciation${compact ? ' is-compact' : ''}`}>
    {ipa && !compact ? <span className="vocabulary-ipa">{pronunciation.group ? `${regionalIpa ? accent.toUpperCase() : 'IPA'} ${ipa}` : ipa}</span> : null}
    <div className="vocabulary-pronunciation-actions" role="group" aria-label="Word pronunciation">
      {(compact ? [accent] : ['uk', 'us'] as const).map(target => {
        const action = target === accent ? 'target' : `accent:${target}`;
        const missing = pronunciation.required && !pronunciation.recordings.some(recording=>recording.accent===target);
        const retry = pronunciation.required ? pronunciation.recordings.find(recording=>recording.accent===target&&recording.status==='verified'&&recording.wordformConfirmed===true&&recording.availability==='failed') : undefined;
        const playing = activeAction === (retry?.url || action);
        return <button key={target} className="btn line" type="button" aria-label={`${playing ? 'Stop' : 'Play'} ${target.toUpperCase()} pronunciation of ${entry.term}`} onClick={() => void play(retry, target)}>{playing ? 'Stop' : missing ? `${target.toUpperCase()} · No matched audio` : retry ? `Retry · ${target.toUpperCase()} audio` : compact ? `Play ${target.toUpperCase()}` : target === 'uk' ? 'Listen · UK' : 'Listen · US'}</button>;
      })}
    </div>
    {pronunciation.legacy && readingSensitive ? <span className="vocabulary-pronunciation-note">Meaning match was not saved for this session.</span> : null}
    {visibleMessage ? <span role="status">{visibleMessage}</span> : null}
    {!compact && mediaLoading ? <InlineLoadingState message="Loading pronunciation details…" onRetry={() => void load(generation.current, true)} retryLabel="Retry media metadata" /> : null}
    {!compact && mediaError && <StateMessage inline kind="error" message="Pronunciation details could not be loaded." onRetry={() => void load(generation.current, true)} retryLabel="Retry media metadata" />}
    {recovery && (!compact || pronunciation.required) ? <div className="vocabulary-audio-recovery" role="group" aria-label="Alternative pronunciations">{others.map(recording=><button className="btn line" type="button" key={recording.url} onClick={()=>void play(recording)}>{activeAction===recording.url?'Stop ':''}{recording.accent === 'unknown' ? 'Unverified accent' : recording.accent === 'other' ? 'Other accent' : recording.accent.toUpperCase()} — {recording.author || recording.title}</button>)}{pronunciation.required ? <button className="btn line" type="button" onClick={()=>void play(undefined,accent,true)}>{activeAction===`device:${accent}`?'Stop ':''}Use {accent.toUpperCase()} device voice (reading unverified)</button> : null}</div> : null}
  </div>;
}
