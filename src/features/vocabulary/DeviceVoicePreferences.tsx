import { useEffect, useMemo, useState } from 'react';
import { preferredDeviceVoice, saveDeviceVoice, subscribeDeviceVoices, targetVoices } from './deviceVoices';
import { createVocabularyPlayback } from './playback';
import { playbackMessage } from './Pronunciation';
import type { VocabularyAccent } from '../../domain/vocabulary/media';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
export function DeviceVoicePreferences({ disabled = false }: { disabled?: boolean }) {
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const player = useMemo(() => createVocabularyPlayback(), []);
  useEffect(() => { const update = () => { setRevision(value => value + 1); setLoaded(true); }; const unsubscribe = subscribeDeviceVoices(update); const timer = setTimeout(() => setLoaded(true), 1500); return () => { clearTimeout(timer); unsubscribe(); player.stop(); }; }, [player]);
  void revision;
  const trial = async (accent: VocabularyAccent) => { const result = await player.play({ term: 'The fresh vegetables are ready for dinner.' } as VocabularyEntry, { accent, deviceOnly: true }); setMessage(playbackMessage(result)); };
  return <fieldset className="vocabulary-device-voices"><legend>Device pronunciation voices</legend><p>Choose a UK or US synthetic voice for examples and words without playable recorded pronunciation. Voice choices are saved immediately on this device.</p>{(['uk', 'us'] as const).map(accent => { const voices = targetVoices(accent); return <div key={accent}><label>{accent.toUpperCase()} voice <select aria-label={`${accent.toUpperCase()} device voice`} disabled={disabled || !voices.length} value={preferredDeviceVoice(accent)?.voiceURI || ''} onChange={event => { const saved = saveDeviceVoice(accent, event.target.value); setRevision(value => value + 1); setMessage(saved ? `${accent.toUpperCase()} voice saved on this device.` : 'Device storage is blocked; this preference could not be saved.'); }}>{!voices.length && <option value="">{loaded ? 'No matching voice on this device' : 'Loading device voices…'}</option>}{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select></label><button className="btn line" type="button" disabled={disabled || !voices.length} onClick={() => void trial(accent)}>Try {accent.toUpperCase()} voice</button></div>; })}{loaded && !targetVoices('uk').length && !targetVoices('us').length && <p>Install an English voice in your device’s speech settings, then reopen this panel.</p>}<p role="status">{message}</p></fieldset>;
}
