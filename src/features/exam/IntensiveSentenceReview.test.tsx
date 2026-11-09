import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IntensiveSentenceReview } from './IntensiveSentenceReview';
import type { IntensiveSession } from '../../domain/exam/types';

const mocks = vi.hoisted(() => ({ props: null as any, recovery: new Map<string, any>() }));
vi.mock('./IntensiveAudio', () => ({ IntensiveAudio: (props: any) => { mocks.props = props; return <><button onClick={props.onReplay}>Play test audio</button><button onClick={props.onSentenceEnd}>Finish test audio</button></>; } }));
vi.mock('../../components/SessionAudioPlayer', () => ({ SessionAudioPlayer: () => <p>Saved shadowing</p> }));
vi.mock('../../storage/examRecovery', () => ({ readExamRecovery: (owner: string, key: string) => mocks.recovery.get(owner + key), writeExamRecovery: (owner: string, key: string, value: unknown) => mocks.recovery.set(owner + key, structuredClone(value)), clearExamRecovery: (owner: string, key: string) => mocks.recovery.delete(owner + key) }));
const session = { id: 'old', sectionId: 'part', sentenceId: 's1', completedAt: '2020-01-01', nextReviewAt: '2020-01-02', selfRating: 4, transcriptInput: 'My previous dictation', shadowingAudioId: 'old-audio' } as IntensiveSession;
function open(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  const onRestart = vi.fn();
  const view = render(<MemoryRouter><IntensiveSentenceReview owner="one" session={session} sentence={{ id: 's1', text: 'The train leaves at nine.', start: 0, end: 3, alignment: 'source' }} audioUrl="/audio.mp3" audioError="" onRetryAudio={vi.fn()} onSave={onSave} onRestart={onRestart} {...overrides} /></MemoryRouter>);
  return { ...view, onSave, onRestart };
}
afterEach(() => { cleanup(); mocks.recovery.clear(); vi.restoreAllMocks(); });

test('future practice is complete and explains where the scheduled review will appear', () => {
  open({ session: { ...session, nextReviewAt: '2099-01-01' } });
  expect(screen.getByRole('heading', { name: 'Practice complete' })).toBeInTheDocument();
  expect(screen.getByText(/will appear in Listening.*Review when/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start listening review' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open listening review' })).toHaveAttribute('href', '/listening/review');
});

test('due review is opt-in, hides prior answers and requires a complete blind playback before rating', async () => {
  const { onSave } = open(); const user = userEvent.setup();
  expect(screen.getByRole('heading', { name: 'Listening review due' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Start listening review' }));
  expect(screen.queryByText('My previous dictation')).not.toBeInTheDocument();
  expect(screen.queryByText('The train leaves at nine.')).not.toBeInTheDocument();
  const finish = screen.getByRole('button', { name: 'Save review and schedule next' });
  expect(finish).toBeDisabled(); expect(screen.getByLabelText('How much did you understand?')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Finish test audio' })); expect(finish).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Play test audio' }));
  act(() => mocks.props.onPlaybackInvalidated());
  await user.click(screen.getByRole('button', { name: 'Finish test audio' })); expect(finish).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Play test audio' }));
  await user.click(screen.getByRole('button', { name: 'Finish test audio' }));
  expect(screen.getByLabelText('How much did you understand?')).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Show transcript' }));
  expect(screen.getByText('The train leaves at nine.')).toBeVisible();
  await user.click(screen.getByText('Need more practice?'));
  await user.click(screen.getByRole('button', { name: 'Practise dictation and shadowing again' }));
  expect(onSave).not.toHaveBeenCalled();
});

test('a failed save survives reopening and retries the same review instead of creating another cycle', async () => {
  const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const user = userEvent.setup(); let view = open({ onSave });
  await user.click(screen.getByRole('button', { name: 'Start listening review' }));
  await user.click(screen.getByRole('button', { name: 'Play test audio' }));
  await user.click(screen.getByRole('button', { name: 'Finish test audio' }));
  // The themed SelectField accepts the underlying native change contract.
  const { selectChoice } = await import('../../../tests/selectChoice');
  await selectChoice(screen.getByLabelText('How much did you understand?'), '4 · Mostly clear');
  await user.click(screen.getByRole('button', { name: 'Save review and schedule next' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('kept on this device');
  const candidate = structuredClone(onSave.mock.calls[0][0]);
  view.unmount(); view = open({ onSave });
  await user.click(screen.getByRole('button', { name: 'Retry saving review' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  expect(onSave.mock.calls[1][0]).toEqual(candidate);
  expect(await screen.findByText('Review saved')).toBeInTheDocument();
  expect(mocks.recovery.size).toBe(0);
});

test('a successful save clears its retry draft even after leaving the page', async () => {
  let finish: (saved: boolean) => void = () => {};
  const onSave = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const user = userEvent.setup(); const view = open({ onSave });
  await user.click(screen.getByRole('button', { name: 'Start listening review' }));
  await user.click(screen.getByRole('button', { name: 'Play test audio' }));
  await user.click(screen.getByRole('button', { name: 'Finish test audio' }));
  const { selectChoice } = await import('../../../tests/selectChoice');
  await selectChoice(screen.getByLabelText('How much did you understand?'), '4 · Mostly clear');
  await user.click(screen.getByRole('button', { name: 'Save review and schedule next' }));
  view.unmount();
  await act(async () => finish(true));
  expect(mocks.recovery.size).toBe(0);
});
