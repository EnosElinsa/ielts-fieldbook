import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IntensiveAudio } from './IntensiveAudio';

const { events, wave } = vi.hoisted(() => {
  const events: Record<string, (...args: unknown[]) => void> = {};
  const wave = { on: vi.fn((event, cb) => { events[event] = cb; }), load: vi.fn().mockResolvedValue(undefined), destroy: vi.fn(), setTime: vi.fn(), setPlaybackRate: vi.fn(), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
  return { events, wave };
});
vi.mock('wavesurfer.js', () => ({ default: { create: () => wave } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('plays the current segment and stops at its end, then loops when requested', async () => {
  const replay = vi.fn(), finished = vi.fn();
  const view = render(<IntensiveAudio src="audio.mp3" start={10} end={15} speed={1} loop={false} onReplay={replay} onSentenceEnd={finished} onSpeedChange={() => {}} onLoopChange={() => {}} onPrevious={() => {}} onNext={() => {}} />);
  act(() => { events.ready(100); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Replay sentence' })); });
  expect(wave.setTime).toHaveBeenCalledWith(10);
  expect(replay).toHaveBeenCalledTimes(1);
  act(() => { events.play(); events.timeupdate(15); });
  expect(wave.pause).toHaveBeenCalled();
  expect(finished).toHaveBeenCalledTimes(1);
  view.rerender(<IntensiveAudio src="audio.mp3" start={10} end={15} speed={1} loop onReplay={replay} onSentenceEnd={finished} onSpeedChange={() => {}} onLoopChange={() => {}} onPrevious={() => {}} onNext={() => {}} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Replay sentence' })); });
  act(() => { events.play(); events.timeupdate(15); });
  expect(replay).toHaveBeenCalledTimes(3);
});

it('keyboard shortcuts leave editing fields alone and errors offer retry', () => {
  const next = vi.fn();
  render(<><textarea aria-label="Dictation" /><IntensiveAudio src="audio.mp3" start={0} end={2} speed={1} loop={false} onReplay={() => {}} onSentenceEnd={() => {}} onSpeedChange={() => {}} onLoopChange={() => {}} onPrevious={() => {}} onNext={next} /></>);
  act(() => { events.ready(100); });
  fireEvent.keyDown(screen.getByLabelText('Dictation'), { key: 'ArrowRight' });
  expect(next).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(next).toHaveBeenCalledOnce();
  act(() => { events.error(); });
  expect(screen.getByRole('alert')).toHaveTextContent('Audio could not load');
  expect(screen.getByRole('button', { name: 'Retry audio' })).toBeInTheDocument();
});
