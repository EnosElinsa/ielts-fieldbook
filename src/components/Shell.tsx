// @ts-nocheck
import { useEffect, useMemo, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { studyStreak } from '../domain';
import { useFieldbook } from '../context/FieldbookContext';
import { NavIcons, Toast } from './ui';
import { SettingsModal } from '../features/modals/SettingsModal';
import { SaveModal } from '../features/modals/SaveModal';
import { HistoryModal } from '../features/modals/HistoryModal';
import { LexiconModal } from '../features/modals/LexiconModal';
import { StoryModal } from '../features/modals/StoryModal';
import { BackupModal } from '../features/modals/BackupModal';

const writingLinks = [
  { to: '/', end: true, label: 'Today', icon: NavIcons.today },
  { to: '/write/questions', label: 'Questions', icon: NavIcons.questions },
  { to: '/write', end: true, label: 'Write', icon: NavIcons.write },
  { to: '/review', label: 'Review', icon: NavIcons.review },
  { to: '/phrases', label: 'Phrases', icon: NavIcons.phrases },
  { to: '/progress', label: 'Progress', icon: NavIcons.progress },
];

const speakingLinks = [
  { to: '/', end: true, label: 'Today', icon: NavIcons.today },
  { to: '/speak/questions', label: 'Questions', icon: NavIcons.questions },
  { to: '/stories', label: 'Stories', icon: NavIcons.stories },
  { to: '/speak', end: true, label: 'Practice', icon: NavIcons.write },
  { to: '/review', label: 'Review', icon: NavIcons.review },
  { to: '/phrases', label: 'Phrases', icon: NavIcons.phrases },
  { to: '/progress', label: 'Progress', icon: NavIcons.progress },
];

function chromeFor(pathname: string, activeSkill: string, deskName: string, topicName: string) {
  const speaking = activeSkill === 'speaking';
  const skillLabel = speaking ? 'Speaking' : 'Writing';
  if (pathname.startsWith('/review/') && pathname !== '/review') return { kicker: 'Score', title: 'Score report' };
  if (pathname.startsWith('/speak/topics/')) return { kicker: 'Speaking topic', title: topicName || 'Speaking topic' };
  if (pathname === '/write/questions') return { kicker: 'Writing bank', title: 'Writing questions' };
  if (pathname === '/write' || pathname.startsWith('/write?')) return { kicker: 'Writing', title: deskName || 'Writing' };
  if (pathname === '/speak/questions') return { kicker: 'Speaking bank', title: 'Sep–Dec topics' };
  if (pathname === '/stories') return { kicker: 'Stories', title: 'Your stories' };
  if (pathname === '/speak') return { kicker: 'Practice', title: topicName || 'Speaking practice' };
  if (pathname.startsWith('/review')) return { kicker: 'Review', title: speaking ? 'Attempts and scores' : 'Essays and scores' };
  if (pathname.startsWith('/phrases')) return { kicker: 'Phrases', title: 'Words, phrases, patterns' };
  if (pathname.startsWith('/progress')) return { kicker: 'Progress', title: 'The last four weeks' };
  return { kicker: skillLabel, title: 'Today' };
}

export function Shell() {
  const fb = useFieldbook();
  const location = useLocation();
  const navigate = useNavigate();
  const assessmentInput = useRef(null);
  const backupInput = useRef(null);
  const speaking = fb.activeSkill === 'speaking';
  const links = speaking ? speakingLinks : writingLinks;
  const streak = studyStreak(fb.state);
  const deskName = fb.selectedQuestion?.name || 'Writing';
  const topicName = fb.selectedTopic?.title || 'Speaking practice';
  const chrome = useMemo(
    () => chromeFor(location.pathname, fb.activeSkill, deskName, topicName),
    [location.pathname, fb.activeSkill, deskName, topicName],
  );

  useEffect(() => {
    document.title = `${chrome.title} · IELTS Fieldbook`;
  }, [chrome.title]);

  useEffect(() => {
    const focus = location.pathname === '/write' || location.pathname === '/speak';
    document.querySelector('.shell')?.classList.toggle('is-focus', focus);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (fb.backupMenuOpen) {
          fb.setBackupMenuOpen(false);
          return;
        }
        if (fb.modal) fb.closeModal();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fb]);

  const switchSkill = (skill: string) => {
    const path = location.pathname;
    let next = path;
    if (skill === 'speaking') {
      if (path === '/write/questions' || path.startsWith('/write')) next = path === '/write' ? '/speak' : '/speak/questions';
      if (path === '/write') next = '/speak';
    } else {
      if (path === '/speak/questions' || path.startsWith('/speak/topics')) next = '/write/questions';
      if (path === '/speak' || path === '/stories') next = '/write';
    }
    fb.setSkill(skill, next);
  };

  const importAssessment = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const draft = structuredClone(fb.stateRef.current);
      const result = fb.importAssessmentText(draft, String(reader.result), file.name);
      if (result.invalid) {
        fb.toast(result.reason);
        return;
      }
      fb.persistNow(draft);
      navigate('/review');
      const speakingScore = result.assessment && result.assessment.skill === 'speaking';
      const noun = speakingScore ? 'transcript' : 'essay';
      fb.toast(
        result.duplicate
          ? result.session
            ? `This score was already here. It is linked to the ${noun} again.`
            : 'This score was already imported, and it still has no matching attempt.'
          : result.session
            ? `Score linked to the ${noun}.`
            : `Score saved, but the file has no ${noun} to link.`,
      );
    };
    reader.onerror = () => fb.toast('Could not read the score file.');
    reader.readAsText(file);
  };

  const previewBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        const validation = fb.validateBackup(payload);
        if (!validation.valid) {
          fb.toast(`Could not import: ${validation.reason}`);
          return;
        }
        fb.setPendingBackup(payload);
        fb.openModal('backup');
      } catch {
        fb.toast('Could not import: this is not a JSON backup.');
      }
    };
    reader.onerror = () => fb.toast('Could not read the backup.');
    reader.readAsText(file);
  };

  return (
    <>
      <div className="shell">
        <aside className="rail">
          <div className="mark">
            <div className="mark-box">{speaking ? 'S' : 'W'}</div>
            <div>
              <div className="mark-name">IELTS Fieldbook</div>
              <span className="mark-sub">{speaking ? 'Speaking' : 'Writing'}</span>
            </div>
          </div>
          <div className="skill-switch" role="tablist" aria-label="Skill">
            <button
              type="button"
              role="tab"
              aria-selected={!speaking}
              className={!speaking ? 'active' : undefined}
              data-skill="writing"
              onClick={() => switchSkill('writing')}
            >
              Writing
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={speaking}
              className={speaking ? 'active' : undefined}
              data-skill="speaking"
              onClick={() => switchSkill('speaking')}
            >
              Speaking
            </button>
          </div>
          <nav className="nav" aria-label={speaking ? 'Speaking' : 'Writing'}>
            {links.map((link) => (
              <NavLink
                key={link.to + link.label}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {link.icon}
                </span>
                <span className="nav-label">{link.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="rail-foot">
            <span>Streak</span>
            <strong>{streak} days</strong>
          </div>
        </aside>
        <main className="main">
          <header className="top">
            <div>
              <p className="kicker">{chrome.kicker}</p>
              <h1 className="title">{chrome.title}</h1>
            </div>
            <div className="actions">
              <button className="btn line" type="button" onClick={() => fb.openModal('settings')}>
                Settings
              </button>
              <div className="menu">
                <button
                  className="btn line"
                  type="button"
                  aria-expanded={fb.backupMenuOpen}
                  aria-controls="backupMenu"
                  onClick={() => fb.setBackupMenuOpen((open) => !open)}
                >
                  Backup
                </button>
                <div className="menu-pop" id="backupMenu" hidden={!fb.backupMenuOpen}>
                  <button
                    type="button"
                    onClick={() => {
                      fb.setBackupMenuOpen(false);
                      fb.downloadFile(
                        `ielts-fieldbook-backup-${fb.dateKey(new Date())}.json`,
                        JSON.stringify(
                          Object.assign({}, fb.persistShape(fb.state), {
                            backupMeta: { origin: location.origin, exportedAt: new Date().toISOString() },
                          }),
                          null,
                          2,
                        ),
                        'application/json',
                      );
                    }}
                  >
                    Export backup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fb.setBackupMenuOpen(false);
                      backupInput.current?.click();
                    }}
                  >
                    Import backup
                  </button>
                </div>
              </div>
              <button className="btn primary" type="button" onClick={() => assessmentInput.current?.click()}>
                Import score
              </button>
              <input
                ref={backupInput}
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) previewBackup(file);
                  event.target.value = '';
                }}
              />
              <input
                ref={assessmentInput}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importAssessment(file);
                  event.target.value = '';
                }}
              />
            </div>
          </header>
          <Outlet />
        </main>
      </div>
      <SettingsModal />
      <SaveModal />
      <HistoryModal />
      <LexiconModal />
      <StoryModal />
      <BackupModal />
      <Toast message={fb.toastMessage} visible={fb.toastVisible} />
    </>
  );
}
