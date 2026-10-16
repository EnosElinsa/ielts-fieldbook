// @ts-nocheck
import { PageLoadingState } from './AsyncState';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { studyStreak } from '../domain';
import { useFieldbook } from '../context/FieldbookContext';
import { displayName } from '../lib/format';
import { NavIcons, Toast } from './ui';
import { useAuthUser } from '../auth/useAuthUser';
import { AccountMark } from '../features/account/AccountMark';
import { SaveFailure } from './SaveFailure';
import { Search, PanelLeftClose, PanelLeftOpen, Upload } from 'lucide-react';
import { IconButton } from './IconButton';
import { AccountMenu, CommandSearch, MobileNavigation } from './WorkbenchNavigation';
import { ModalFrame } from './ModalFrame';
import * as Tooltip from '@radix-ui/react-tooltip';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';
import { moduleFor, studyLinkActive, workspaceModules } from './workspaceNavigation';
import { useWorkspaceModuleMemory } from './useWorkspaceModuleMemory';
import { accountId } from '../storage/remote';
import { AccountDataBoundary } from './AccountDataBoundary';
import { PageErrorBoundary } from './PageErrorBoundary';
import { PageTransition } from './PageTransition';
import { WorkspaceScrollRestoration } from './WorkspaceScrollRestoration';
import { SETTINGS_BACKUP_EVENT, type SettingsBackupAction } from '../features/settings/backupActions';

const SettingsModal = lazy(()=>import('../features/modals/SettingsModal').then(m=>({default:m.SettingsModal})));
const SaveModal = lazy(()=>import('../features/modals/SaveModal').then(m=>({default:m.SaveModal})));
const HistoryModal = lazy(()=>import('../features/modals/HistoryModal').then(m=>({default:m.HistoryModal})));
const VocabularyModal = lazy(()=>import('../features/vocabulary/VocabularyModal').then(m=>({default:m.VocabularyModal})));
const VocabularyImportModal = lazy(()=>import('../features/vocabulary/VocabularyImportModal').then(m=>({default:m.VocabularyImportModal})));
const StoryModal = lazy(()=>import('../features/modals/StoryModal').then(m=>({default:m.StoryModal})));
const BackupModal = lazy(()=>import('../features/modals/BackupModal').then(m=>({default:m.BackupModal})));
const AssessmentImportModal = lazy(()=>import('../features/modals/AssessmentImportModal').then(m=>({default:m.AssessmentImportModal})));
const LegalModal = lazy(()=>import('../features/modals/LegalModal').then(m=>({default:m.LegalModal})));

function WorkspaceRoute() {
  const {pathname, key} = useLocation();
  let modules = []; let banks = [];
  if (pathname.startsWith('/vocabulary')) modules = ['vocabulary'];
  else if (/^\/(reading|listening)/.test(pathname)) modules = ['receptive'];
  else if (pathname.startsWith('/progress')) modules = ['productive','vocabulary','receptive'];
  else if (pathname.startsWith('/write')) { modules = ['productive']; banks = ['writing']; }
  else if (pathname.startsWith('/speak')) { modules = ['productive']; banks = ['speaking']; }
  else if (pathname.startsWith('/stories')) {modules=['productive'];banks=['speaking'];}
  else if (pathname.startsWith('/review')) modules=['productive','vocabulary'];
  else if (pathname.startsWith('/settings')) modules=['productive','vocabulary','receptive'];
  return <PageErrorBoundary resetKey={`${accountId()}:${key}`}><AccountDataBoundary modules={modules} banks={banks}><Outlet /></AccountDataBoundary></PageErrorBoundary>;
}

function RailHint({ label, enabled, children }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger>{enabled ? <Tooltip.Portal><Tooltip.Content className="tooltip rail-tooltip" side="right" sideOffset={10}>{label}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal> : null}</Tooltip.Root>;
}

const RAIL_KEY = 'ielts-fieldbook-rail';

const studyLinks = {
  reading: [{to:'/reading',label:'Questions',icon:NavIcons.questions},{to:'/reading/review',label:'Review',icon:NavIcons.review}],
  listening: [{to:'/listening',label:'Questions',icon:NavIcons.questions},{to:'/listening/review',label:'Review',icon:NavIcons.review}],
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

function chromeFor(pathname: string, activeSkill: string, deskName: string, topicName: string, search = '') {
  if (pathname.startsWith('/reading')) return {kicker:'Reading',title:pathname.includes('/review')?'Reading review':'Reading'};
  if (pathname.startsWith('/listening')) return {kicker:'Listening',title:pathname.includes('/intensive')?'Intensive listening':pathname.includes('/review')?'Listening review':'Listening'};
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
  if (pathname.startsWith('/settings')) return { kicker: 'Workspace', title: 'Settings' };
  if (pathname.startsWith('/planning')) return { kicker: 'Study', title: 'Planning' };
  return { kicker: 'Study', title: 'Today' };
}

export function Shell() {
  const fb = useFieldbook();
  const accountUser = useAuthUser();
  const location = useLocation();
  const navigate = useNavigate();
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
  const module = moduleFor(location.pathname, location.search, fb.activeSkill);
  const { selectModule: resumeModule, scrollRestoration } = useWorkspaceModuleMemory({ owner: accountId(), ready: fb.booted, activeSkill: fb.activeSkill, setSkill: fb.setSkill });
  const speaking = module === 'speaking';
  const secondaryLinks = studyLinks[module] || [];
  const vocabularyOwnHeading = location.pathname.startsWith('/vocabulary');
  const streak = !fb.moduleStatus || fb.moduleStatus.productive === 'ready' && fb.moduleStatus.receptive === 'ready' ? studyStreak(fb.state) : null;
  // Filters and answer edits stay still; changing the reviewed skill is a new view.
  const transitionKey = location.pathname + (location.pathname === '/review' ? `:${new URLSearchParams(location.search).get('skill') || fb.activeSkill}` : location.pathname === '/progress' ? `:${new URLSearchParams(location.search).get('category') || fb.activeSkill}` : '');
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
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fb]);

  const selectModule = (path: string) => {
    if (path === '/write') fb.setSkill('writing', path);
    else if (path === '/speak') fb.setSkill('speaking', path);
    else if (path === '/reading') fb.setSkill('reading',path);
    else if (path === '/listening') fb.setSkill('listening',path);
    else navigate(path);
  };
  const goFromMore = (path: string) => {
    setMoreOpen(false);
    navigateWithPracticeGuard(path, () => selectModule(path));
  };

  const exportBackup = async () => {
    try {
      const complete = fb.ensureCompleteAccount ? await fb.ensureCompleteAccount() : fb.state;
      fb.downloadFile(`ielts-fieldbook-backup-${fb.dateKey(new Date())}.json`, JSON.stringify(Object.assign({}, fb.persistShape(complete), { backupMeta: { origin: location.origin, exportedAt: new Date().toISOString() } }), null, 2), 'application/json');
      fb.toast('Backup exported. Recordings stay in your account and are not in the JSON.');
    } catch { fb.toast('Could not load the complete account for backup. Try again.'); }
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

  useEffect(() => {
    const requested = (event: Event) => {
      const action = (event as CustomEvent<SettingsBackupAction>).detail;
      if (action === 'export') void exportBackup();
      if (action === 'import') backupInput.current?.click();
    };
    document.addEventListener(SETTINGS_BACKUP_EVENT, requested);
    return () => document.removeEventListener(SETTINGS_BACKUP_EVENT, requested);
  }, [fb]);

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
            {workspaceModules.map((link) => {
              const icon = link.id === 'today' ? NavIcons.today : link.id === 'writing' ? NavIcons.write : link.id === 'speaking' ? NavIcons.speaking : link.id === 'vocabulary' ? NavIcons.vocabulary : link.id === 'progress' ? NavIcons.progress : <link.Icon size={20} />;
              const children = studyLinks[link.id] || [];
              return <div className="nav-group" key={link.to}>
                <RailHint label={link.label} enabled={collapsed}><Link
                  to={link.to} aria-current={module === link.id ? 'page' : undefined} aria-label={link.label} data-practice-navigation
                  onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); resumeModule(link.id); }}
                  className={module === link.id ? 'active' : undefined}
                ><span className="nav-icon" aria-hidden="true">{icon}</span><span className="nav-label">{link.label}</span></Link></RailHint>
                {module === link.id && children.length ? <nav className="nav-children" aria-label={`${link.label} study`}>
                  {children.map((child) => <RailHint key={child.to} label={child.label} enabled={collapsed}><Link to={child.to} aria-label={child.label} aria-current={studyLinkActive(child.to, location.pathname, location.search, module) ? 'page' : undefined} className={studyLinkActive(child.to, location.pathname, location.search, module) ? 'active' : undefined}>
                    <span className="nav-icon" aria-hidden="true">{child.icon}</span><span className="nav-label">{child.label}</span>
                  </Link></RailHint>)}
                </nav> : null}
              </div>;
            })}
          </nav>
          <nav className="nav nav-account" aria-label="Account navigation">
            <RailHint label="Account" enabled={collapsed}><NavLink to="/settings/account" aria-label="Account" className={({ isActive }) => (isActive ? 'active' : undefined)}>
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
            {streak === null ? <Link to="/progress" className="rail-activity-link">View activity</Link> : <strong>{streak} {streak === 1 ? 'day' : 'days'}</strong>}
          </div>
        </aside></Tooltip.Provider>
        <main className="main">
          <header className="top">
            {!vocabularyOwnHeading ? <div className="page-title" key={`${chrome.kicker}-${chrome.title}`}>
              <p className="kicker">{chrome.kicker}</p>
              <h1 className="title">{chrome.title}</h1>
            </div> : <div className="page-title page-title-compact"><p className="kicker">Vocabulary</p></div>}
            <div className="actions">
              <IconButton label="Search workspace" onClick={() => setSearchOpen(true)}><Search size={18} /></IconButton>
              <AccountMenu user={accountUser} onImportBackup={() => backupInput.current?.click()} onExportBackup={exportBackup} onLegal={setLegalView} />
              <button className="btn text legacy-header-action" type="button" onClick={() => navigateWithPracticeGuard('/settings', () => navigate('/settings'))}>
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
                      void exportBackup();
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
              {!['vocabulary', 'account', 'settings', 'planning', 'reading', 'listening'].includes(module) && !['reading','listening'].includes(fb.activeSkill) ? <button className="btn primary import-score" type="button" onClick={() => fb.openFeedbackImport()}>
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
            </div>
          </header>
          <SaveFailure failed={fb.saveFailed && !location.pathname.startsWith('/settings')} message={fb.saveFailureMessage || undefined} saving={fb.saveStatus === 'saving'} onRetry={() => void fb.persistNow()} />
          {fb.loadError ? <div className="recovery-banner" role="alert"><span>{fb.loadError}</span><button className="btn line" onClick={fb.retryLoad}>Retry</button></div> : null}
          {fb.recoveryDrafts ? <div className="recovery-banner" role="status"><span>Unsaved drafts from this browser are available.</span><button className="btn primary" onClick={() => fb.resolveDraftRecovery(true)}>Restore drafts</button><button className="btn line" onClick={() => fb.resolveDraftRecovery(false)}>Keep cloud drafts</button></div> : null}
          {!fb.booted && !fb.loadError ? <PageLoadingState message="Loading workspace…" variant="bank" /> : null}
          <PageTransition transitionKey={transitionKey} key={module === 'settings' ? 'settings' : location.pathname}>
            <WorkspaceScrollRestoration.Provider value={scrollRestoration}><Suspense fallback={<PageLoadingState message="Loading page…" />}>{fb.booted || fb.state.questions.length ? <WorkspaceRoute /> : null}</Suspense></WorkspaceScrollRestoration.Provider>
          </PageTransition>
        </main>
      </div>
      <MobileNavigation onMore={() => setMoreOpen(true)} onSelectModule={resumeModule} />
      <ModalFrame open={moreOpen} onClose={() => setMoreOpen(false)} title="More" header="Your workspace"><div className="more-modal">{secondaryLinks.length > 0 && <p className="eyebrow">{workspaceModules.find(link => link.id === module)?.label} study</p>}<div className="mobile-more-links">{secondaryLinks.map((link) => <button type="button" key={link.to} className={studyLinkActive(link.to, location.pathname, location.search, module) ? 'active' : undefined} onClick={() => goFromMore(link.to)}>{link.icon}{link.label}</button>)}{workspaceModules.filter(link => ['planning', 'progress', 'settings'].includes(link.id)).map(link => <button type="button" key={link.id} className={module === link.id ? 'active' : undefined} onClick={() => { setMoreOpen(false); resumeModule(link.id); }}><link.Icon size={20} />{link.label}</button>)}<button type="button" onClick={() => goFromMore('/settings/account')}>Account</button></div></div></ModalFrame>
      {searchOpen && <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />}
      <Suspense fallback={<PageLoadingState message="Opening dialog…" />}>
        {fb.modal === 'assessment' && <AssessmentImportModal />}
        {legalView && <LegalModal view={legalView} onClose={() => setLegalView(null)} />}
        {fb.modal === 'settings' && <SettingsModal />}
        {fb.modal === 'save' && <SaveModal />}
        {fb.modal === 'history' && <AccountDataBoundary modules={['productive']}><HistoryModal /></AccountDataBoundary>}
        {fb.modal === 'vocabulary' && <AccountDataBoundary modules={['vocabulary']}><VocabularyModal /></AccountDataBoundary>}
        {fb.modal === 'vocabularyImport' && <AccountDataBoundary modules={['vocabulary']}><VocabularyImportModal /></AccountDataBoundary>}
        {fb.modal === 'story' && <AccountDataBoundary modules={['productive']} banks={['speaking']}><StoryModal /></AccountDataBoundary>}
        {fb.modal === 'backup' && <BackupModal />}
      </Suspense>
      <Toast message={fb.toastMessage} visible={fb.toastVisible} />
    </>
  );
}
