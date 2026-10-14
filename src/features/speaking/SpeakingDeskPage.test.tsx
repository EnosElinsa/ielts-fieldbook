import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { SpeakingDeskPage } from './SpeakingDeskPage';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { speakingPrompts } from '../../domain/speaking';

const { putAudio, setPendingAttempt, openModal, writePendingAudio, readPendingAudio, deletePendingAudio, desk } = vi.hoisted(() => ({ putAudio: vi.fn(), setPendingAttempt: vi.fn(), openModal: vi.fn(), writePendingAudio: vi.fn().mockResolvedValue(true), readPendingAudio: vi.fn().mockResolvedValue(null), deletePendingAudio: vi.fn().mockResolvedValue(true), desk: { part: '1', mode: 'speak-blind', index: 0, owner: 'account-1', drafts: {} as Record<string, any>, statuses: {} as Record<string, string> } }));
vi.mock('../../storage/audio', () => ({ putAudio }));
vi.mock('../../storage/pendingAudio', () => ({
  writePendingAudio, readPendingAudio, deletePendingAudio,
}));
vi.mock('../../storage/remote', () => ({ accountId: () => desk.owner }));
vi.mock('../../components/SessionAudioPlayer', () => ({ RecordingPlayer: ({ label }: { label: string }) => <div>{label === 'Unassociated earlier recording' ? 'Earlier recording player' : 'Decoded recording player'}</div> }));
vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => { const [index, setIndex] = useState(desk.index); return ({
    state: { ...emptyState(), speakingTopics: [], stories: [] },
    selectedTopic: { id: 'speaking-1', title: 'Your home', part: 1, questions: ['Where do you live?', 'What do you like about your home?'] },
    deskPart: desk.part, questionIndex: index, setQuestionIndex: (next: number) => { desk.index = next; setIndex(next); }, currentDeskMode: () => desk.mode,
    speakingDraft: (_topic: string, key?: string) => ({ transcript: '', notes: '', targetErrorIds: ['error-1'], ...desk.drafts[key || 'legacy'] }),
    draftSaveStatus: (_topic: string, key?: string) => desk.statuses[key || 'legacy'] || 'saved',
    setSpeakingDraft: (_topic: string, patch: any) => { desk.drafts[patch.promptKey || 'legacy'] = { ...desk.drafts[patch.promptKey || 'legacy'], ...patch }; }, scheduleDraftPersist: vi.fn(), toast: vi.fn(),
    wordCount: (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
    setPendingAttempt, openModal, persistNow: vi.fn().mockResolvedValue(true), flushDraftPersist: vi.fn(),
  }); },
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); readPendingAudio.mockResolvedValue(null); sessionStorage.clear(); vi.useRealTimers(); desk.part = '1'; desk.mode = 'speak-blind'; desk.index = 0; desk.drafts = {}; desk.statuses = {}; desk.owner = 'account-1'; });

test('the speaking footer shows all five scoped draft statuses and retry without leaking another prompt status', () => {
  const [first] = speakingPrompts({ title: 'Your home', questions: ['Where do you live?', 'What do you like about your home?'] }, '1');
  desk.statuses[first.promptKey] = 'unsaved';
  const view = render(<SpeakingDeskPage />);
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Draft has unsaved changes.');
  desk.statuses[first.promptKey] = 'pending'; view.rerender(<SpeakingDeskPage />);
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Waiting to save draft...');
  desk.statuses[first.promptKey] = 'saving'; view.rerender(<SpeakingDeskPage />);
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Saving draft...');
  desk.statuses[first.promptKey] = 'failed'; view.rerender(<SpeakingDeskPage />);
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Draft could not be saved.');
  expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '2. What do you like about your home?' }));
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Draft saved.');
  fireEvent.click(screen.getByRole('button', { name: '1. Where do you live?' }));
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Draft could not be saved.');
  desk.statuses[first.promptKey] = 'saved'; view.rerender(<SpeakingDeskPage />);
  expect(view.container.querySelector('.editor-foot [role="status"]')).toHaveTextContent('Draft saved.');
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
});

test('switching speaking prompts isolates transcript and recording and restores each response', async () => {
  const firstPrompt = speakingPrompts({ title: 'Your home', questions: ['Where do you live?', 'What do you like about your home?'] }, '1')[0];
  readPendingAudio.mockImplementation(async (_owner, _topic, _part, key) => key === firstPrompt.promptKey ? new Blob(['first recording']) : null);
  URL.createObjectURL = vi.fn(() => 'blob:first'); URL.revokeObjectURL = vi.fn();
  const view = render(<SpeakingDeskPage />);
  await screen.findByText('Decoded recording player');
  fireEvent.change(screen.getByRole('textbox', { name: 'Speaking transcript' }), { target: { value: 'First response' } });
  fireEvent.click(screen.getByRole('button', { name: '2. What do you like about your home?' }));
  expect(desk.index).toBe(1);
  expect(Object.values(desk.drafts).map((draft: any) => [draft.promptKey, draft.transcript])).toEqual([[firstPrompt.promptKey, 'First response']]);
  view.rerender(<SpeakingDeskPage />);
  expect(screen.getByRole('button', { name: '2. What do you like about your home?' })).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Speaking transcript' })).toHaveValue(''));
  expect(screen.queryByText('Decoded recording player')).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Speaking transcript' }), { target: { value: 'Second response' } });
  fireEvent.click(screen.getByRole('button', { name: '1. Where do you live?' })); view.rerender(<SpeakingDeskPage />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Speaking transcript' })).toHaveValue('First response'));
  expect(await screen.findByText('Decoded recording player')).toBeInTheDocument();
});

test('a permission result after switching prompts releases its stream and cannot record the new prompt', async () => {
  let release!: (value: unknown) => void;
  const stop = vi.fn(); const start = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise(resolve => { release = resolve; }) } });
  vi.stubGlobal('MediaRecorder', class { start = start; });
  render(<SpeakingDeskPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Record' }));
  await userEvent.click(screen.getByRole('button', { name: '2. What do you like about your home?' }));
  await act(async () => { release({ getTracks: () => [{ stop }] }); });
  expect(stop).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
});

test('account changes isolate transcript, timer and delayed uploads', async () => {
  readPendingAudio.mockImplementation(async owner => owner === 'account-1' ? new Blob(['owner-one']) : null);
  URL.createObjectURL = vi.fn(() => 'blob:owner-one'); URL.revokeObjectURL = vi.fn();
  let release!: () => void; putAudio.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const view = render(<SpeakingDeskPage />);
  await screen.findByText('Decoded recording player');
  fireEvent.change(screen.getByRole('textbox', { name: 'Speaking transcript' }), { target: { value: 'Owner one response' } });
  await userEvent.click(screen.getByRole('button', { name: 'Finish practice' }));
  await waitFor(() => expect(putAudio).toHaveBeenCalled());
  desk.owner = 'account-2'; desk.drafts = {};
  view.rerender(<SpeakingDeskPage />);
  await act(async () => { release(); });
  expect(screen.getByRole('textbox', { name: 'Speaking transcript' })).toHaveValue('');
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:30');
  expect(screen.queryByText('Decoded recording player')).toBeNull();
  expect(setPendingAttempt).not.toHaveBeenCalled(); expect(openModal).not.toHaveBeenCalled();
});

test('legacy topic text and recording require explicit association and survive it', async () => {
  desk.drafts.legacy = { transcript: 'Earlier topic response', notes: 'Earlier notes' };
  readPendingAudio.mockImplementation(async (_owner, _topic, _part, key) => key ? null : new Blob(['legacy audio']));
  URL.createObjectURL = vi.fn(() => 'blob:legacy'); URL.revokeObjectURL = vi.fn();
  render(<SpeakingDeskPage />);
  await screen.findByText('Earlier recording player');
  expect(screen.getByRole('textbox', { name: 'Speaking transcript' })).toHaveValue('');
  expect(screen.queryByText('Decoded recording player')).toBeNull();
  fireEvent.click(screen.getByText('Unassociated earlier response'));
  await userEvent.click(screen.getByRole('button', { name: 'Associate with current question' }));
  await userEvent.click(screen.getByRole('button', { name: 'Associate response' }));
  expect(screen.getByRole('textbox', { name: 'Speaking transcript' })).toHaveValue('Earlier topic response');
  expect(screen.getByText('Decoded recording player')).toBeInTheDocument();
  expect(desk.drafts.legacy.transcript).toBe('Earlier topic response');
  expect(deletePendingAudio).not.toHaveBeenCalled();
});

test('speaking workspace tabs support Home and arrow-key selection', async () => {
  render(<SpeakingDeskPage />); const user = userEvent.setup();
  screen.getByRole('tab', { name: 'Practice' }).focus();
  await user.keyboard('{Home}');
  expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Practice' })).toHaveFocus();
});

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

test('speaking countdown keeps elapsed time while editing the transcript', () => {
  vi.useFakeTimers();
  const view = render(<SpeakingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  for (let index = 0; index < 16; index += 1) {
    act(() => vi.advanceTimersByTime(250));
    fireEvent.change(screen.getByRole('textbox', { name: 'Speaking transcript' }), { target: { value: `Answer ${index}` } });
  }
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:26');
});

test('changing a speaking question preserves the previous question remaining time', () => {
  vi.useFakeTimers();
  const view = render(<SpeakingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => vi.advanceTimersByTime(4000));
  fireEvent.click(screen.getByRole('button', { name: '2. What do you like about your home?' }));
  view.rerender(<SpeakingDeskPage />);
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:30');
  fireEvent.click(screen.getByRole('button', { name: '1. Where do you live?' }));
  view.rerender(<SpeakingDeskPage />);
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:26');
  expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
});

test('mobile speaking returns to its selected panel and Part 2 notes collapse on answering', () => {
  desk.part = '2'; desk.mode = 'speak-notes';
  const view = render(<SpeakingDeskPage />);
  expect(screen.getByRole('tab', { name: 'Practice' })).toHaveAttribute('aria-selected', 'true');
  const preparation = screen.getByText('One-minute notes').closest('details')!;
  expect(preparation).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Start answer' }));
  expect(preparation).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }));
  view.unmount();
  render(<SpeakingDeskPage />);
  expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true');
});

test('preparation countdown continues through notes editing and moves to the answer once', () => {
  vi.useFakeTimers(); desk.part = '2'; desk.mode = 'speak-notes';
  const view = render(<SpeakingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start notes' }));
  for (let index = 0; index < 16; index += 1) {
    act(() => vi.advanceTimersByTime(250));
    fireEvent.change(screen.getByRole('textbox', { name: 'Preparation notes' }), { target: { value: `Note ${index}` } });
  }
  expect(view.container.querySelector('.preparation-notes .timer')).toHaveTextContent('0:56');
  act(() => vi.advanceTimersByTime(56000));
  expect(view.container.querySelector('[aria-current="step"]')).toHaveTextContent('Answer');
  expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
});

test('recording restarts an exhausted answer timer and expires into recoverable playback', async () => {
  vi.useFakeTimers();
  const stopTracks = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTracks }] }) } });
  vi.stubGlobal('MediaRecorder', class {
    state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: any; onstop: any;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['answer'], { type: 'audio/webm' }) }); this.onstop?.(); }
  });
  URL.createObjectURL = vi.fn(() => 'blob:answer'); URL.revokeObjectURL = vi.fn();
  const view = render(<SpeakingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => vi.advanceTimersByTime(30000));
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:00');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record' })); });
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:30');
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  expect(screen.getByText('Decoded recording player')).toBeInTheDocument();
  expect(view.container.querySelector('[aria-current="step"]')).toHaveTextContent('Review');
  expect(stopTracks).toHaveBeenCalledTimes(1);
  expect(writePendingAudio).toHaveBeenCalledWith('account-1', 'speaking-1', '1', expect.any(Blob), expect.any(String));
});

test('button-driven module departure protects a pending recording and allows a confirmed departure', async () => {
  readPendingAudio.mockResolvedValue(new Blob(['pending actual audio'], { type: 'audio/webm' }));
  URL.createObjectURL = vi.fn(() => 'blob:pending'); URL.revokeObjectURL = vi.fn();
  await act(async () => { render(<SpeakingDeskPage />); });
  expect(screen.getByText('Decoded recording player')).toBeInTheDocument();
  const proceed = vi.fn();
  act(() => { expect(navigateWithPracticeGuard('/vocabulary', proceed)).toBe(false); });
  expect(proceed).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(proceed).not.toHaveBeenCalled();
  act(() => { expect(navigateWithPracticeGuard('/vocabulary', proceed)).toBe(false); });
  await userEvent.click(screen.getByRole('button', { name: 'Leave practice' }));
  await waitFor(() => expect(proceed).toHaveBeenCalledOnce());
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
  await userEvent.click(screen.getByRole('button', {name:'Finish practice'}));
  await waitFor(() => expect(putAudio).toHaveBeenCalled());
  view.unmount();
  await act(async () => {resolveUpload();});
  expect(setPendingAttempt).not.toHaveBeenCalled();
  expect(openModal).not.toHaveBeenCalled();
});

test('a failed re-record keeps the previous audio available for recovery', async () => {
  readPendingAudio.mockResolvedValue(new Blob(['previous audio'], { type: 'audio/webm' }));
  URL.createObjectURL = vi.fn(() => 'blob:previous'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } });
  vi.stubGlobal('MediaRecorder', class {});
  render(<SpeakingDeskPage />);
  await screen.findByText('Decoded recording player');
  await userEvent.click(screen.getByRole('button', { name: 'Re-record' }));
  await userEvent.click(screen.getByRole('button', { name: 'Replace recording' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('permission was denied');
  expect(screen.getByText('Decoded recording player')).toBeInTheDocument();
  expect(deletePendingAudio).not.toHaveBeenCalled();
});

test('a recorder initialization failure releases the acquired microphone', async () => {
  const stop = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  vi.stubGlobal('MediaRecorder', class { constructor() { throw new Error('Recorder unavailable'); } });
  render(<SpeakingDeskPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not start');
  expect(stop).toHaveBeenCalledOnce();
});

test('only one microphone request can be pending', async () => {
  let resolve!: (stream: unknown) => void;
  const getUserMedia = vi.fn(() => new Promise(done => { resolve = done; }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', class { state = 'inactive'; start() {} });
  render(<SpeakingDeskPage />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Record' }));
  expect(screen.getByRole('button', { name: 'Opening microphone...' })).toBeDisabled();
  expect(getUserMedia).toHaveBeenCalledOnce();
  await act(async () => { resolve({ getTracks: () => [{ stop: vi.fn() }] }); });
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
  expect(writePendingAudio).toHaveBeenCalledWith('account-1', 'speaking-1', '1', expect.any(Blob), expect.any(String));
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  const link = document.createElement('a');
  link.href = '/review';
  link.textContent = 'Leave practice';
  document.body.append(link);
  const navigate = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  act(() => { link.dispatchEvent(navigate); });
  expect(navigate.defaultPrevented).toBe(true);
  expect(screen.getByRole('dialog')).toHaveTextContent('Leave speaking practice?');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  link.remove();
  await userEvent.click(screen.getByRole('button', { name: 'Finish practice' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Finish practice' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Clear recording' }));
  expect(deletePendingAudio).toHaveBeenCalledWith('account-1', 'speaking-1', '1', expect.any(String));
  expect(screen.queryByText('Decoded recording player')).not.toBeInTheDocument();
});
