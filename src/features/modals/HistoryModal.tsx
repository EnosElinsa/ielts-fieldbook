// @ts-nocheck
import { useFieldbook } from '../../context/FieldbookContext';
import { attemptLabel, displayName, formatDate, sessionSkill } from '../../lib/format';
import { ModalFrame } from '../../components/ModalFrame';
import { SessionAudioPlayer } from '../../components/SessionAudioPlayer';

export function HistoryModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'history';
  const session = fb.viewedSession;
  if (!session) return null;

  return (
    <ModalFrame open={open} onClose={() => fb.closeModal()}>
      <div className="modal">
        <h3>
          {displayName(session.name)} · {attemptLabel(session)}
        </h3>
        <p>
          {formatDate(session.date, true)} · {session.words} words
        </p>
        {sessionSkill(session) === 'speaking' && session.audioId ? (
          <SessionAudioPlayer audioId={session.audioId} label="Playback" />
        ) : null}
        <div className="history-copy">{session.essay}</div>
        <div className="modal-foot">
          <button className="btn line" type="button" onClick={() => fb.closeModal()}>
            Close
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              fb.closeModal();
              if (sessionSkill(session) === 'speaking') {
                const topic = fb.state.speakingTopics.find((t) => String(t.id) === String(session.questionId));
                if (topic) {
                  fb.setSelectedTopicId(String(topic.id));
                  fb.setDeskPart(String(session.part || '2'));
                  fb.setSpeakingDraft(topic.id, {
                    transcript: session.essay,
                    notes: session.notes || fb.speakingDraft(topic.id).notes,
                    parentSessionId: session.id,
                  });
                  const saved = await fb.persistNow();
                  fb.navigate('/speak');
                  if (saved) fb.toast('Copied into a new draft.');
                }
                return;
              }
              const q = fb.state.questions.find((question) => String(question.id) === String(session.questionId));
              if (q) fb.setSelectedQuestionId(String(q.id));
              fb.setWritingDraft(q?.id || session.questionId, session.essay, { parentSessionId: session.id });
              const saved = await fb.persistNow();
              fb.navigate('/write');
              if (saved) fb.toast('Copied into a new draft.');
            }}
          >
            Continue in a new draft
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
