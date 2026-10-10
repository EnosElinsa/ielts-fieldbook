import type { VocabularyAccent } from '../../domain/vocabulary/media';
const key = (accent: VocabularyAccent) => `fieldbook.deviceVoice.${accent}`;
export function targetVoices(accent: VocabularyAccent): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  try { return speechSynthesis.getVoices().filter(voice => voice.lang.replace('_', '-').toLowerCase() === (accent === 'uk' ? 'en-gb' : 'en-us')); } catch { return []; }
}
export function preferredDeviceVoice(accent: VocabularyAccent): SpeechSynthesisVoice | undefined {
  const voices = targetVoices(accent);
  let preferred: string | null = null; try { preferred = localStorage.getItem(key(accent)); } catch { /* Device storage may be blocked. */ }
  return voices.find(voice => voice.voiceURI === preferred) || voices.find(voice => voice.default) || voices[0];
}
export function saveDeviceVoice(accent: VocabularyAccent, uri: string): boolean { try { localStorage.setItem(key(accent), uri); return true; } catch { return false; } }
export function subscribeDeviceVoices(listener: () => void): () => void {
  if (typeof speechSynthesis === 'undefined') return () => {};
  speechSynthesis.addEventListener('voiceschanged', listener);
  return () => speechSynthesis.removeEventListener('voiceschanged', listener);
}
