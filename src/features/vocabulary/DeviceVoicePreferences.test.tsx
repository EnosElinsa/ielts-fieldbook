import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DeviceVoicePreferences } from './DeviceVoicePreferences';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
describe('device voice controls', () => {
 test('updates target selectors after voiceschanged and persists a local preference', async () => {
  let voices: SpeechSynthesisVoice[] = []; let change: (() => void) | undefined;
  vi.stubGlobal('speechSynthesis', { getVoices: () => voices, addEventListener: (_type: string, listener: () => void) => { change = listener; }, removeEventListener: () => {}, cancel: () => {} });
  render(<DeviceVoicePreferences />);
  expect((screen.getByLabelText('UK device voice') as HTMLSelectElement).disabled).toBe(true);
  voices = [{ lang: 'en-GB', name: 'UK device A', voiceURI: 'uk-a' }, { lang: 'en-GB', name: 'UK device B', voiceURI: 'uk-b' }] as SpeechSynthesisVoice[];
  change!(); await waitFor(() => expect((screen.getByLabelText('UK device voice') as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('UK device voice'), { target: { value: 'uk-b' } }); expect(localStorage.getItem('fieldbook.deviceVoice.uk')).toBe('uk-b'); expect((screen.getByLabelText('US device voice') as HTMLSelectElement).disabled).toBe(true);
 });
});
