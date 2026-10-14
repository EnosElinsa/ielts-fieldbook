import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IntensiveAudio } from './IntensiveAudio';

const { events, wave } = vi.hoisted(() => {
  const events: Record<string, (...args: unknown[]) => void> = {};
  const wave = { on: vi.fn((event, cb) => { events[event] = cb; }), load: vi.fn().mockResolvedValue(undefined), destroy: vi.fn(), getDuration:()=>100, setTime: vi.fn(), setOptions: vi.fn(), setPlaybackRate: vi.fn(), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
  return { events, wave };
});
vi.mock('wavesurfer.js', () => ({ default: { create: () => wave } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

it('retries a delayed audio load and offers recovery after the player reports failure', async () => {
  vi.useFakeTimers();
  render(<IntensiveAudio src="audio.mp3" start={0} end={2} speed={1} loop={false} onReplay={() => {}} onSentenceEnd={() => {}} onSpeedChange={() => {}} onLoopChange={() => {}} onPrevious={() => {}} onNext={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading audio…');
  expect(screen.queryByRole('button', { name: 'Retry audio' })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(10_000));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry audio' })));
  expect(wave.load).toHaveBeenCalledTimes(2);
  expect(wave.destroy).toHaveBeenCalledOnce();
  act(() => events.error());
  expect(screen.getByRole('alert')).toHaveTextContent('Audio could not load');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry audio' })));
  expect(wave.load).toHaveBeenCalledTimes(3);
  act(() => events.ready(100));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replay sentence' })).toBeEnabled();
});

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

it('updates waveform colors with the theme without restarting playback', async () => {
  render(<IntensiveAudio src="audio.mp3" start={0} end={2} speed={1} loop={false} onReplay={() => {}} onSentenceEnd={() => {}} onSpeedChange={() => {}} onLoopChange={() => {}} onPrevious={() => {}} onNext={() => {}} />);
  const loadCount = wave.load.mock.calls.length;
  await act(async () => { document.documentElement.style.setProperty('--blue', '#89aaff'); document.documentElement.dataset.theme = 'dark'; });
  expect(wave.setOptions).toHaveBeenCalledWith(expect.objectContaining({ progressColor: '#89aaff' }));
  expect(wave.load).toHaveBeenCalledTimes(loadCount);
  document.documentElement.removeAttribute('data-theme'); document.documentElement.style.removeProperty('--blue');
});


it('shortcuts respect dialogs, links and browser modifier keys', () => {
  const next = vi.fn(), replay = vi.fn();
  const props = { src: 'audio.mp3', start: 0, end: 2, speed: 1, loop: false, onReplay: replay, onSentenceEnd: () => {}, onSpeedChange: () => {}, onLoopChange: () => {}, onPrevious: () => {}, onNext: next };
  const view = render(<><a href="/listening">Bank</a><IntensiveAudio {...props} /><div role="dialog">Settings</div></>);
  act(() => events.ready(100));
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
  expect(next).not.toHaveBeenCalled(); expect(replay).not.toHaveBeenCalled();
  view.rerender(<><a href="/listening">Bank</a><IntensiveAudio {...props} /></>);
  fireEvent.keyDown(screen.getByRole('link'), { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
  expect(next).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(next).toHaveBeenCalledOnce();
});
const segmentProps={src:'audio.mp3',start:10,end:15,speed:1,loop:false,onReplay:()=>{},onSpeedChange:()=>{},onLoopChange:()=>{},onPrevious:()=>{},onNext:()=>{}};
it('an early pause invalidates completion even when the media later reaches the end',async()=>{
  const finished=vi.fn();render(<IntensiveAudio {...segmentProps} onSentenceEnd={finished}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.timeupdate(12);events.pause();events.play();events.timeupdate(15);events.finish();});
  expect(finished).not.toHaveBeenCalled();
});
it('seeking to the endpoint invalidates a sentence pass',async()=>{
  const finished=vi.fn();render(<IntensiveAudio {...segmentProps} onSentenceEnd={finished}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.seeking?.(15);events.timeupdate(15);events.finish();});
  expect(finished).not.toHaveBeenCalled();
});
it('a full-track finish without sentence timing cannot earn sentence completion',async()=>{
  const finished=vi.fn();render(<IntensiveAudio {...segmentProps} start={undefined} end={undefined} full onSentenceEnd={finished}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.timeupdate(100);events.finish();});expect(finished).not.toHaveBeenCalled();
});
it('a same-bounds sentence scope switch cannot inherit an ongoing replay',async()=>{
  const first=vi.fn(),second=vi.fn();const view=render(<IntensiveAudio {...segmentProps} scope="s1:blind" onSentenceEnd={first}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.timeupdate(12);});
  view.rerender(<IntensiveAudio {...segmentProps} scope="s2:blind" onSentenceEnd={second}/>);
  act(()=>{events.play();events.timeupdate(15);events.finish();});expect(first).not.toHaveBeenCalled();expect(second).not.toHaveBeenCalled();
});
it('an endpoint update before playback begins cannot complete the sentence',async()=>{
  const finished=vi.fn();render(<IntensiveAudio {...segmentProps} onSentenceEnd={finished}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>events.timeupdate(15));expect(finished).not.toHaveBeenCalled();
});
it('a queued native pause from restarting playback does not invalidate the fresh replay',async()=>{
  const finished=vi.fn();render(<IntensiveAudio {...segmentProps} onSentenceEnd={finished}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.timeupdate(12);});
  wave.pause.mockImplementationOnce(()=>queueMicrotask(()=>events.pause()));
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.timeupdate(13);events.timeupdate(15);});
  expect(finished).toHaveBeenCalledOnce();
});
it('looping the final sentence ignores the previous track-ended event and completes the fresh pass',async()=>{
  const finished=vi.fn();render(<IntensiveAudio {...segmentProps} start={95} end={100} loop onSentenceEnd={finished}/>);
  act(()=>events.ready(100));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Replay sentence'})));
  act(()=>{events.play();events.timeupdate(100);events.finish();events.play();events.timeupdate(98);events.timeupdate(100);});
  expect(finished).toHaveBeenCalledTimes(2);
});
