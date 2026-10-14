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
              try { await fb.startTargetedPractice(session); }
              catch { fb.toast('Could not open this attempt. Try again.'); }
            }}
          >
            Continue in a new draft
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
