// @ts-nocheck
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { studyStreak } from '../domain';
import { useFieldbook } from '../context/FieldbookContext';
import { displayName } from '../lib/format';
import { NavIcons, Toast } from './ui';
import { SettingsModal } from '../features/modals/SettingsModal';
import { SaveModal } from '../features/modals/SaveModal';
import { HistoryModal } from '../features/modals/HistoryModal';
import { VocabularyModal } from '../features/vocabulary/VocabularyModal';
import { VocabularyImportModal } from '../features/vocabulary/VocabularyImportModal';
import { StoryModal } from '../features/modals/StoryModal';
import { BackupModal } from '../features/modals/BackupModal';
import { useAuthUser } from '../auth/useAuthUser';
import { AccountMark } from '../features/account/AccountMark';
import { SaveFailure } from './SaveFailure';
import { Search, PanelLeftClose, PanelLeftOpen, Upload } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { IconButton } from './IconButton';
import { AccountMenu, CommandSearch, MobileNavigation } from './WorkbenchNavigation';
import { ModalFrame } from './ModalFrame';
import { AssessmentImportModal } from '../features/modals/AssessmentImportModal';
import { LegalModal } from '../features/modals/LegalModal';
import * as Tooltip from '@radix-ui/react-tooltip';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';

function RailHint({ label, enabled, children }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger>{enabled ? <Tooltip.Portal><Tooltip.Content className="tooltip rail-tooltip" side="right" sideOffset={10}>{label}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal> : null}</Tooltip.Root>;
}

const moduleLinks = [
  { to: '/', end: true, label: 'Today', icon: NavIcons.today },
  { to: '/write', label: 'Writing', icon: NavIcons.write },
  { to: '/speak', label: 'Speaking', icon: NavIcons.speaking },
  { to: '/vocabulary', label: 'Vocabulary', icon: NavIcons.vocabulary },
  { to: '/progress', label: 'Progress', icon: NavIcons.progress },
];

const RAIL_KEY = 'ielts-fieldbook-rail';

const studyLinks = {
  writing: [
    { to: '/write/questions', label: 'Questions', icon: NavIcons.questions },
    { to: '/write', label: 'Practice', icon: NavIcons.write },
    { to: '/review?skill=writing', label: 'Review', icon: NavIcons.review },
  ],
  speaking: [
    { to: '/speak/questions', label: 'Questions', icon: NavIcons.questions },
    { to: '/stories', label: 'Stories', icon: NavIcons.stories },
    { to: '/speak', label: 'Practice', icon: NavIcons.speaking },
    { to: '/review?skill=speaking', label: 'Review', icon: NavIcons.review },
  ],
};

function moduleFor(pathname: string, search: string, fallbackSkill: string) {
  if (pathname.startsWith('/write')) return 'writing';
  if (pathname.startsWith('/speak') || pathname === '/stories') return 'speaking';
  if (pathname.startsWith('/review')) return new URLSearchParams(search).get('skill') === 'speaking' ? 'speaking' : new URLSearchParams(search).get('skill') === 'writing' ? 'writing' : fallbackSkill === 'speaking' ? 'speaking' : 'writing';
  if (pathname.startsWith('/vocabulary')) return 'vocabulary';
  if (pathname.startsWith('/progress')) return 'progress';
  if (pathname.startsWith('/account')) return 'account';
  return 'today';
}

function chromeFor(pathname: string, activeSkill: string, deskName: string, topicName: string, search = '') {
  const reviewSkill = new URLSearchParams(search).get('skill');
  const effectiveSkill = reviewSkill === 'speaking' || reviewSkill === 'writing' ? reviewSkill : activeSkill;
  const speaking = effectiveSkill === 'speaking';
  const skillLabel = speaking ? 'Speaking' : 'Writing';
  if (pathname.startsWith('/review/') && pathname !== '/review') return { kicker: 'Score', title: 'Score report' };
  if (pathname.startsWith('/speak/topics/')) return { kicker: 'Speaking topic', title: topicName || 'Speaking topic' };
  if (pathname === '/write/questions') return { kicker: 'Writing bank', title: 'Writing questions' };
  if (pathname === '/write' || pathname.startsWith('/write?')) return { kicker: 'Writing', title: deskName || 'Writing' };
  if (pathname === '/speak/questions') return { kicker: 'Speaking bank', title: 'Sep–Dec topics' };
  if (pathname === '/stories') return { kicker: 'Stories', title: 'Your stories' };
  if (pathname === '/speak') return { kicker: 'Practice', title: topicName || 'Speaking practice' };
  if (pathname.startsWith('/review')) return { kicker: 'Review', title: speaking ? 'Attempts and scores' : 'Essays and scores' };
  if (pathname.startsWith('/vocabulary')) return { kicker: 'Vocabulary', title: 'Vocabulary' };
  if (pathname.startsWith('/progress')) return { kicker: 'Progress', title: 'Progress' };
  if (pathname.startsWith('/account')) return { kicker: 'Account', title: 'Your account' };
  return { kicker: skillLabel, title: 'Today' };
}

export function Shell() {
  const fb = useFieldbook();
  const accountUser = useAuthUser();
  const location = useLocation();
  const navigate = useNavigate();
  const assessmentInput = useRef(null);
  const backupInput = useRef(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [legalView, setLegalView] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const module = moduleFor(location.pathname, location.search, fb.activeSkill);
  const speaking = module === 'speaking';
  const secondaryLinks = module === 'writing' || module === 'speaking' ? studyLinks[module] : [];
  const vocabularyPractice = ['/vocabulary/study', '/vocabulary/review'].includes(location.pathname) || location.pathname.startsWith('/vocabulary/history/');
  const streak = studyStreak(fb.state);
  const deskName = displayName(fb.selectedQuestion?.name) || 'Writing';
  const topicName = fb.selectedTopic?.title || 'Speaking practice';
  const chrome = useMemo(
    () => chromeFor(location.pathname, fb.activeSkill, deskName, topicName, location.search),
    [location.pathname, location.search, fb.activeSkill, deskName, topicName],
  );

  useEffect(() => {
    document.title = `${chrome.title} · IELTS Fieldbook`;
  }, [chrome.title]);

  const toggleRail = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(RAIL_KEY, next ? 'collapsed' : 'open');
      } catch {
        /* keep the choice for this visit */
      }
      return next;
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
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

  const selectModule = (path: string) => {
    if (path === '/write') fb.setSkill('writing', path);
    else if (path === '/speak') fb.setSkill('speaking', path);
    else navigate(path);
  };
  const goFromMore = (path: string) => {
    setMoreOpen(false);
    navigateWithPracticeGuard(path, () => navigate(path));
  };

  const exportBackup = () => {
    fb.downloadFile(`ielts-fieldbook-backup-${fb.dateKey(new Date())}.json`, JSON.stringify(Object.assign({}, fb.persistShape(fb.state), { backupMeta: { origin: location.origin, exportedAt: new Date().toISOString() } }), null, 2), 'application/json');
    fb.toast('Backup exported. Recordings stay in your account and are not in the JSON.');
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
      <div className={`${collapsed ? 'shell is-collapsed' : 'shell'}${speaking ? ' skill-speaking' : ''}`}>
        <Tooltip.Provider delayDuration={350}><aside className="rail">
          <div className="mark">
            <div className="mark-box" aria-hidden="true"><img src="/favicon.svg" alt="" width="32" height="32" /></div>
            <div className="mark-copy">
              <div className="mark-name">IELTS Fieldbook</div>
              <span className="mark-sub">Your study workspace</span>
            </div>
          </div>
          <nav className="nav" aria-label="Main navigation">
            {moduleLinks.map((link) => (
              <RailHint key={link.to + link.label} label={link.label} enabled={collapsed}><NavLink
                key={link.to + link.label}
                to={link.to}
                end={link.end}
                aria-label={link.label}
                data-practice-navigation
                onClick={(event) => { event.preventDefault(); navigateWithPracticeGuard(link.to, () => selectModule(link.to)); }}
                className={module === (link.to === '/' ? 'today' : link.to.slice(1) === 'write' ? 'writing' : link.to.slice(1) === 'speak' ? 'speaking' : link.to.slice(1)) ? 'active' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">
                  {link.icon}
                </span>
                <span className="nav-label">{link.label}</span>
              </NavLink></RailHint>
            ))}
          </nav>
          {secondaryLinks.length ? <nav className="nav nav-secondary" aria-label={`${speaking ? 'Speaking' : 'Writing'} study`}>
            {secondaryLinks.map((link) => <RailHint key={link.to} label={link.label} enabled={collapsed}><NavLink to={link.to} end={link.to === '/write' || link.to === '/speak'} aria-label={link.label} className={({ isActive }) => isActive ? 'active' : undefined}>
              <span className="nav-icon" aria-hidden="true">{link.icon}</span><span className="nav-label">{link.label}</span>
            </NavLink></RailHint>)}
          </nav> : null}
          <nav className="nav nav-account" aria-label="Account navigation">
            <RailHint label="Study settings" enabled={collapsed}><button className="nav-settings" type="button" onClick={() => fb.openModal('settings')} aria-label="Study settings"><span className="nav-icon" aria-hidden="true">{NavIcons.settings}</span><span className="nav-label">Study settings</span></button></RailHint>
            <RailHint label="Account" enabled={collapsed}><NavLink to="/account" aria-label="Account" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <span className="nav-icon">
                <AccountMark user={accountUser} size="nav" />
              </span>
              <span className="nav-label">Account</span>
            </NavLink></RailHint>
          </nav>
          <RailHint label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} enabled={collapsed}><button
            type="button"
            className="rail-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleRail}
          >
            <span className="nav-icon" aria-hidden="true">
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </span>
            <span className="rail-toggle-label">{collapsed ? 'Expand' : 'Collapse'}</span>
          </button></RailHint>
          <div className="rail-foot">
            <span>Streak</span>
            <strong>{streak} days</strong>
          </div>
        </aside></Tooltip.Provider>
        <main className="main">
          <header className="top">
            {!vocabularyPractice ? <div className="page-title" key={`${chrome.kicker}-${chrome.title}`}>
              <p className="kicker">{chrome.kicker}</p>
              <h1 className="title">{chrome.title}</h1>
            </div> : <div className="page-title page-title-compact"><p className="kicker">Vocabulary</p></div>}
            <div className="actions">
              <IconButton label="Search workspace" onClick={() => setSearchOpen(true)}><Search size={18} /></IconButton>
              <AccountMenu user={accountUser} onImportBackup={() => backupInput.current?.click()} onExportBackup={exportBackup} onLegal={setLegalView} />
              <button className="btn text legacy-header-action" type="button" onClick={() => fb.openModal('settings')}>
                Settings
              </button>
              <div className="menu legacy-header-action">
                <button
                  className="btn text"
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
                      fb.toast('Backup exported. Recordings stay in your account and are not in the JSON.');
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
              {module !== 'vocabulary' && module !== 'account' ? <button className="btn primary import-score" type="button" onClick={() => fb.openFeedbackImport()}>
                <Upload size={16} />Import score
              </button> : null}
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
          <SaveFailure failed={fb.saveFailed} />
          {fb.loadError ? <div className="recovery-banner" role="alert"><span>{fb.loadError}</span><button className="btn line" onClick={fb.retryLoad}>Retry</button></div> : null}
          {fb.recoveryDrafts ? <div className="recovery-banner" role="status"><span>Unsaved drafts from this browser are available.</span><button className="btn primary" onClick={() => fb.resolveDraftRecovery(true)}>Restore drafts</button><button className="btn line" onClick={() => fb.resolveDraftRecovery(false)}>Keep cloud drafts</button></div> : null}
          {!fb.booted && !fb.loadError ? <div className="workspace-skeleton" aria-label="Loading workspace"><div /><div /><div /></div> : null}
          <motion.div className="page" key={location.pathname} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
            <Suspense fallback={<div className="workspace-skeleton" aria-label="Loading page"><div /><div /></div>}>{fb.booted || fb.state.questions.length ? <Outlet /> : null}</Suspense>
          </motion.div>
        </main>
      </div>
      <MobileNavigation onMore={() => setMoreOpen(true)} />
      <ModalFrame open={moreOpen} onClose={() => setMoreOpen(false)} title="More"><div className="modal more-modal"><div className="mobile-more-links"><button type="button" onClick={() => goFromMore('/progress')}>{NavIcons.progress}Progress</button>{secondaryLinks.map((link) => <button type="button" key={link.to} onClick={() => goFromMore(link.to)}>{link.icon}{link.label}</button>)}<button onClick={() => { setMoreOpen(false); fb.openModal('settings'); }}>Study settings</button><button type="button" onClick={() => goFromMore('/account')}>Account</button></div></div></ModalFrame>
      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AssessmentImportModal />
      <LegalModal view={legalView} onClose={() => setLegalView(null)} />
      <SettingsModal />
      <SaveModal />
      <HistoryModal />
      <VocabularyModal />
      <VocabularyImportModal />
      <StoryModal />
      <BackupModal />
      <Toast message={fb.toastMessage} visible={fb.toastVisible} />
    </>
  );
}
