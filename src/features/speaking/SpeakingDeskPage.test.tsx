import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { SpeakingDeskPage } from './SpeakingDeskPage';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';

const { putAudio, setPendingAttempt, openModal, writePendingAudio, readPendingAudio, deletePendingAudio } = vi.hoisted(() => ({ putAudio: vi.fn(), setPendingAttempt: vi.fn(), openModal: vi.fn(), writePendingAudio: vi.fn().mockResolvedValue(true), readPendingAudio: vi.fn().mockResolvedValue(null), deletePendingAudio: vi.fn().mockResolvedValue(true) }));
vi.mock('../../storage/audio', () => ({ putAudio }));
vi.mock('../../storage/pendingAudio', () => ({
  writePendingAudio, readPendingAudio, deletePendingAudio,
}));
vi.mock('../../storage/remote', () => ({ accountId: () => 'account-1' }));
vi.mock('../../components/SessionAudioPlayer', () => ({ RecordingPlayer: () => <div>Decoded recording player</div> }));
vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => ({
    state: { ...emptyState(), speakingTopics: [], stories: [] },
    selectedTopic: { id: 'speaking-1', title: 'Your home', part: 1, questions: ['Where do you live?'] },
    deskPart: '1', questionIndex: 0, currentDeskMode: () => 'speak-blind',
    speakingDraft: () => ({ transcript: '', notes: '', targetErrorIds: ['error-1'] }),
    setSpeakingDraft: vi.fn(), scheduleDraftPersist: vi.fn(), toast: vi.fn(),
    wordCount: (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
    setPendingAttempt, openModal, persistNow: vi.fn().mockResolvedValue(true), flushDraftPersist: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); readPendingAudio.mockResolvedValue(null); sessionStorage.clear(); vi.useRealTimers(); });

test('speaking practice returns with a paused timer and phase without starting a recording', () => {
  vi.useFakeTimers();
  const first = render(<SpeakingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => vi.advanceTimersByTime(4000));
  expect(first.container.querySelector('.timer')).toHaveTextContent('0:26');
  first.unmount();
  act(() => vi.advanceTimersByTime(60000));
  const returned = render(<SpeakingDeskPage />);
  expect(returned.container.querySelector('.timer')).toHaveTextContent('0:26');
  expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  expect(returned.container.querySelector('[aria-current="step"]')).toHaveTextContent('Answer');
});

test('button-driven module departure protects a pending recording and allows a confirmed departure', async () => {
  readPendingAudio.mockResolvedValue(new Blob(['pending actual audio'], { type: 'audio/webm' }));
  URL.createObjectURL = vi.fn(() => 'blob:pending'); URL.revokeObjectURL = vi.fn();
  render(<SpeakingDeskPage />);
  await screen.findByText('Decoded recording player');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const proceed = vi.fn();
  expect(navigateWithPracticeGuard('/vocabulary', proceed)).toBe(false);
  expect(proceed).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  expect(navigateWithPracticeGuard('/vocabulary', proceed)).toBe(true);
  expect(proceed).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

test('a microphone permission result arriving after departure stops its stream without recording', async () => {
  let resolveStream: (value: unknown) => void = () => {};
  const stop = vi.fn(); const start = vi.fn();
  vi.stubGlobal('navigator', {mediaDevices:{getUserMedia: () => new Promise(resolve => {resolveStream = resolve;})}});
  vi.stubGlobal('MediaRecorder', class { start = start; });
  const view = render(<SpeakingDeskPage />);
  await userEvent.click(screen.getByRole('button', {name:'Record'}));
  view.unmount();
  await act(async () => {resolveStream({getTracks: () => [{stop}]});});
  expect(stop).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});

test('an upload finishing after departure cannot open a save dialog in another page', async () => {
  readPendingAudio.mockResolvedValue(new Blob(['pending actual audio'], {type:'audio/webm'}));
  URL.createObjectURL = vi.fn(() => 'blob:pending'); URL.revokeObjectURL = vi.fn();
  let resolveUpload: () => void = () => {};
  putAudio.mockImplementationOnce(() => new Promise<void>(resolve => {resolveUpload = resolve;}));
  const view = render(<SpeakingDeskPage />);
  await screen.findByText('Decoded recording player');
  fireEvent.change(screen.getByRole('textbox', {name:'Speaking transcript'}), {target:{value:'My answer.'}});
  await userEvent.click(screen.getByRole('button', {name:'Finished'}));
  await waitFor(() => expect(putAudio).toHaveBeenCalled());
  view.unmount();
  await act(async () => {resolveUpload();});
  expect(setPendingAttempt).not.toHaveBeenCalled();
  expect(openModal).not.toHaveBeenCalled();
});

test('an upload failure retains raw recording and requires retry or explicit transcript-only choice', async () => {
  const stopTracks = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTracks }] }) } });
  vi.stubGlobal('MediaRecorder', class {
    state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: any; onstop: any;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['real recording'], { type: 'audio/webm' }) }); this.onstop?.(); }
  });
  URL.createObjectURL = vi.fn(() => 'blob:test-recording');
  URL.revokeObjectURL = vi.fn();
  putAudio.mockRejectedValueOnce(new Error('Offline'));
  render(<SpeakingDeskPage />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Speaking transcript' }), { target: { value: 'I live in a small city.' } });
  await userEvent.click(screen.getByRole('button', { name: 'Record' }));
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(writePendingAudio).toHaveBeenCalledWith('account-1', 'speaking-1', '1', expect.any(Blob));
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const link = document.createElement('a');
  link.href = '/review';
  link.textContent = 'Leave practice';
  document.body.append(link);
  const navigate = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(navigate);
  expect(navigate.defaultPrevented).toBe(true);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('recording has not been uploaded'));
  link.remove();
  confirm.mockRestore();
  await userEvent.click(screen.getByRole('button', { name: 'Finished' }));
  expect(await screen.findByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Download recording' })).toHaveAttribute('href', 'blob:test-recording');
  expect(setPendingAttempt).not.toHaveBeenCalled();
  expect(openModal).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Continue with transcript only' }));
  await waitFor(() => expect(setPendingAttempt).toHaveBeenCalledWith(expect.objectContaining({ audioId: null, essay: 'I live in a small city.', practiceMode: 'speak-blind', targetErrorIds: ['error-1'] })));
  expect(screen.getByText('Decoded recording player')).toBeInTheDocument();
  expect(putAudio).toHaveBeenCalledTimes(1);
});

test('a durable pending recording restores and survives cancelled completion until explicitly cleared', async () => {
  const blob = new Blob(['pending actual audio'], { type: 'audio/webm' });
  readPendingAudio.mockResolvedValue(blob);
  URL.createObjectURL = vi.fn(() => 'blob:restored');
  URL.revokeObjectURL = vi.fn();
  putAudio.mockResolvedValue(undefined);
  const view = render(<SpeakingDeskPage />);
  expect(await screen.findByText('Decoded recording player')).toBeInTheDocument();
  expect(readPendingAudio).toHaveBeenCalledWith('account-1', 'speaking-1', '1');
  fireEvent.change(screen.getByRole('textbox', { name: 'Speaking transcript' }), { target: { value: 'Restored answer.' } });
  await userEvent.click(screen.getByRole('button', { name: 'Finished' }));
  expect(openModal).toHaveBeenCalledWith('save');
  expect(deletePendingAudio).not.toHaveBeenCalled();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  view.unmount();
  expect(deletePendingAudio).not.toHaveBeenCalled();
  render(<SpeakingDeskPage />);
  expect(await screen.findByText('Decoded recording player')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear audio' }));
  expect(deletePendingAudio).toHaveBeenCalledWith('account-1', 'speaking-1', '1');
  expect(screen.queryByText('Decoded recording player')).not.toBeInTheDocument();
});
