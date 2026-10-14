import { selectChoice } from '../../../tests/selectChoice';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { RecordingPlayer, SessionAudioPlayer } from '../../components/SessionAudioPlayer';

const { events, player, create, getAudio } = vi.hoisted(() => {
  const events: Record<string, (...args: any[]) => void> = {};
  const player = { on: vi.fn((name, callback) => { events[name] = callback; }), load: vi.fn().mockResolvedValue(undefined), destroy: vi.fn(), setTime: vi.fn(), setPlaybackRate: vi.fn(), playPause: vi.fn().mockResolvedValue(undefined) };
  return { events, player, create: vi.fn((_options: { url?: string; media?: HTMLMediaElement; [key: string]: unknown }) => player), getAudio: vi.fn() };
});
vi.mock('wavesurfer.js', () => ({ default: { create } }));
vi.mock('../../storage/audio', () => ({ getAudio }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('waveform decodes the actual source and playback controls use decoded timing', async () => {
  const view = render(<RecordingPlayer src="blob:actual-recording" />);
  expect(create.mock.calls[0][0].url).toBe('blob:actual-recording');
  expect(create.mock.calls[0][0].media).toBe(view.container.querySelector('audio'));
  expect(create.mock.calls[0][0]).not.toHaveProperty('peaks');
  expect(screen.getByText('Loading audio waveform…')).toBeInTheDocument();
  act(() => { events.ready(120); events.timeupdate(30); });
  expect(screen.getByText('0:30 / 2:00')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('slider', { name: 'Recording playback position' }), { target: { value: '60' } });
  expect(player.setTime).toHaveBeenCalledWith(60);
  await selectChoice(screen.getByRole('combobox', { name: 'Playback speed' }), '1.5x');
  expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5, true);
  await userEvent.click(screen.getByRole('button', { name: 'Play recording' }));
  expect(player.playPause).toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'blob:actual-recording');
  view.unmount();
  expect(player.destroy).toHaveBeenCalled();
});

test('a missing account recording offers a working retry', async () => {
  getAudio.mockResolvedValue(null);
  render(<SessionAudioPlayer audioId="attempt-1" />);
  expect(await screen.findByText('Recording unavailable on this account.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry recording' }));
  await waitFor(() => expect(getAudio).toHaveBeenCalledTimes(2));
});
test('decode failure retains the same native media, transport slots, download and retry',async()=>{
  const playback=vi.fn();const {container}=render(<RecordingPlayer src="blob:playable-recording" onPlaybackChange={playback}/>);
  const audio=container.querySelector('audio');
  expect(audio).not.toBeNull();expect(audio).toHaveAttribute('controls');expect(audio).toHaveAttribute('src','blob:playable-recording');
  expect(create.mock.calls.at(-1)?.[0].media).toBe(audio);
  const seek=screen.getByRole('slider',{name:'Recording playback position'});expect(seek).toBeDisabled();
  const transport=screen.getByRole('button',{name:'Play recording'});expect(transport).toBeDisabled();
  fireEvent.play(audio!);expect(playback).toHaveBeenLastCalledWith(true);
  act(()=>events.error(new Error('unsupported decode')));
  expect(screen.getByRole('alert')).toHaveTextContent('waveform could not load');
  expect(container.querySelector('audio')).toBe(audio);expect(audio).toHaveAttribute('controls');
  expect(screen.getByRole('slider',{name:'Recording playback position'})).toBe(seek);
  expect(screen.getByRole('link',{name:'Download'})).toHaveAttribute('href','blob:playable-recording');
  await userEvent.click(screen.getByRole('button',{name:'Retry waveform'}));
  expect(container.querySelector('audio')).toBe(audio);
  act(()=>events.ready(60));expect(seek).toBeEnabled();
  expect(screen.getByRole('button',{name:'Pause recording'})).toBeEnabled();
  fireEvent.pause(audio!);expect(playback).toHaveBeenLastCalledWith(false);
});
