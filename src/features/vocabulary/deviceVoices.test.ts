import { describe, expect, test, vi, afterEach } from 'vitest';
import { preferredDeviceVoice, saveDeviceVoice, targetVoices } from './deviceVoices';
const voice = (lang: string, name: string) => ({ lang, name, voiceURI: name } as SpeechSynthesisVoice);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
describe('device voices', () => {
 test('selects only exact UK/US regions and remembers voice per device', () => {
  const a = voice('en-GB', 'UK A'), b = voice('en-GB', 'UK B'), us = voice('en_US', 'US A');
  vi.stubGlobal('speechSynthesis', { getVoices: () => [voice('en-AU', 'Australian'), a, b, us] });
  expect(targetVoices('uk')).toEqual([a,b]); expect(preferredDeviceVoice('uk')).toBe(a);
  expect(saveDeviceVoice('uk', b.voiceURI)).toBe(true); expect(preferredDeviceVoice('uk')).toBe(b); expect(preferredDeviceVoice('us')).toBe(us);
 });
 test('an absent preferred voice falls back within its exact accent', () => {
  vi.stubGlobal('speechSynthesis', { getVoices: () => [voice('en-GB', 'Available')] }); saveDeviceVoice('uk', 'Removed');
  expect(preferredDeviceVoice('uk')?.name).toBe('Available'); expect(preferredDeviceVoice('us')).toBeUndefined();
 });
 test('blocked local storage does not break selection or playback settings', () => {
  vi.stubGlobal('speechSynthesis', { getVoices: () => [voice('en-GB', 'Available')] });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  expect(preferredDeviceVoice('uk')?.name).toBe('Available'); expect(saveDeviceVoice('uk', 'Available')).toBe(false);
 });
});
