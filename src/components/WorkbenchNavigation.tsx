import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BookOpen, Check, ChevronDown, Library, LogOut, Monitor, Moon, MoreHorizontal, PencilLine, Search, Settings2, Sun, Upload, Download, ShieldCheck, MessageSquare, NotebookTabs, Headphones, UserRound } from 'lucide-react';
import { ModalFrame } from './ModalFrame';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useFieldbook } from '../context/FieldbookContext';
import { AccountMark } from '../features/account/AccountMark';
import { signOut } from '../auth/AuthGate';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';
import { moduleFor, workspaceModules } from './workspaceNavigation';
import { useAccountRequirements } from './AccountDataBoundary';
import { InlineLoadingState } from './AsyncState';
import { displayName, formatDate } from '../lib/format';

type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;

type SearchItem = {
  id: string;
  path: string;
  title: string;
  kind: string;
  Icon: IconComponent;
  run: () => void;
};

/** Exam attempts are stored by paper id; search shows the paper, mode, score and date instead. */
export function examAttemptTitle(row: { skill?: string; sourceId?: string; mode?: string; score?: number; total?: number; completedAt?: string; updatedAt?: string }) {
  const paper = /^cambridge:(\d+):(\d+)$/.exec(String(row.sourceId || ''));
  const name = paper ? `Cambridge IELTS ${paper[1]} · Test ${paper[2]}` : `${row.skill === 'listening' ? 'Listening' : 'Reading'} paper`;
  const when = row.completedAt || row.updatedAt;
  const score = typeof row.score === 'number' && row.total ? ` · ${row.score}/${row.total}` : '';
  return `${name} ${row.mode === 'mock' ? 'mock test' : 'practice'}${score}${when ? ` · ${formatDate(when, false)}` : ''}`;
}

export function AccountMenu({ user, onImportBackup, onExportBackup, onLegal }: { user: { email?: string; user_metadata?: { display_name?: string } } | null; onImportBackup: () => void; onExportBackup: () => void; onLegal: (view: string) => void }) {
  const fb = useFieldbook();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const themeOptions: [Theme, IconComponent, string][] = [
    ['light', Sun, 'Light'],
    ['dark', Moon, 'Dark'],
    ['system', Monitor, 'System'],
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="account-menu-trigger" aria-label="Account menu"><AccountMark user={user} size="nav" /><ChevronDown size={14} /></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" sideOffset={8} align="end">
        <DropdownMenu.Label className="dropdown-label">Your workspace</DropdownMenu.Label>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => navigateWithPracticeGuard('/settings/account', () => navigate('/settings/account'))}><BookOpen size={16} />Account</DropdownMenu.Item>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => navigateWithPracticeGuard('/settings', () => navigate('/settings'))}><Settings2 size={16} />Settings</DropdownMenu.Item>
        <DropdownMenu.Separator className="dropdown-separator" />
        <DropdownMenu.Label className="dropdown-label">Appearance</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {themeOptions.map(([value, Icon, label]) => <DropdownMenu.RadioItem className="dropdown-item" key={value} value={value}><Icon size={16} />{label}<DropdownMenu.ItemIndicator className="item-check"><Check size={15} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
        <DropdownMenu.Separator className="dropdown-separator" />
        <DropdownMenu.Item className="dropdown-item" onSelect={onExportBackup}><Download size={16} />Export backup</DropdownMenu.Item>
        <DropdownMenu.Item className="dropdown-item" onSelect={onImportBackup}><Upload size={16} />Import backup</DropdownMenu.Item>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => onLegal('privacy')}><ShieldCheck size={16} />Privacy & terms</DropdownMenu.Item>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => onLegal('feedback')}><MessageSquare size={16} />Send feedback</DropdownMenu.Item>
        <DropdownMenu.Separator className="dropdown-separator" />
        <DropdownMenu.Item className="dropdown-item" onSelect={() => { void signOut().catch(() => fb.toast('Could not sign out. Try again.')); }}><LogOut size={16} />Sign out</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const searching = Boolean(query.trim());
  const requirements = useAccountRequirements({ modules: searching ? ['productive', 'vocabulary', 'receptive'] : [], banks: searching ? ['writing', 'speaking'] : [] });
  const items = useMemo<SearchItem[]>(() => {
    const rawNavigation: [string, string, IconComponent][] = [
      ...workspaceModules.map(({ label, to, Icon }): [string, string, IconComponent] => [label, to, Icon]),
      ['Listening review', '/listening/review', Headphones],
      ['Reading review', '/reading/review', BookOpen], ['Writing questions', '/write/questions', Library],
      ['Speaking questions', '/speak/questions', Library], ['Writing review', '/review?skill=writing', BookOpen], ['Speaking review', '/review?skill=speaking', BookOpen],
      ['Stories', '/stories', NotebookTabs], ['Vocabulary words', '/vocabulary/words', Library], ['Vocabulary wordbooks', '/vocabulary/wordbooks', Library],
      ['Vocabulary history', '/vocabulary/history', BookOpen], ['Vocabulary review', '/vocabulary/review', BookOpen], ['Account', '/settings/account', UserRound],
    ];
    const navigation: SearchItem[] = rawNavigation.map(([title, path, Icon]) => ({
      id: path,
      path,
      title,
      kind: 'Page',
      Icon,
      run: () => {
        const module = moduleFor(path.split('?')[0], path.includes('?') ? path.slice(path.indexOf('?')) : '', fb.activeSkill);
        if (['writing', 'speaking', 'reading', 'listening'].includes(module)) fb.setSkill(module, path);
        else navigate(path);
      },
    }));
    const search = query.trim().toLowerCase();
    if (!search) return navigation;
    const questions: SearchItem[] = (fb.state.questions as { id: string; name: string }[]).map((q) => ({ id: `w:${q.id}`, path: '/write', title: displayName(q.name), kind: 'Writing question', Icon: PencilLine, run: () => { fb.setSkill('writing', '/write'); fb.chooseQuestion(q.id); } }));
    const topics: SearchItem[] = (fb.state.speakingTopics as { id: string; title: string }[]).map((q) => ({ id: `s:${q.id}`, path: `/speak/topics/${q.id}`, title: q.title, kind: 'Speaking topic', Icon: Library, run: () => { fb.setSelectedTopicId(q.id); fb.setSkill('speaking', `/speak/topics/${q.id}`); } }));
    const attempts: SearchItem[] = (fb.state.sessions as { id: string; name: string }[]).map((s) => ({ id: `a:${s.id}`, path: '', title: displayName(s.name), kind: 'Your attempt', Icon: BookOpen, run: () => { fb.setViewedSession(s); fb.openModal('history'); } }));
    const vocabularyEntries: SearchItem[] = (fb.state.vocabulary as { id: string; term: string; tags?: string[] }[]).filter(p => !p.tags?.includes('archived')).map((p) => ({ id: `v:${p.id}`, path: `/vocabulary/entry/${p.id}`, title: p.term, kind: 'Vocabulary entry', Icon: BookOpen, run: () => navigate(`/vocabulary/entry/${p.id}`) }));
    const examAttempts: SearchItem[] = ((fb.state.examAttempts || []) as { id: string; skill?: string; status?: string; sourceId?: string; mode?: string; score?: number; total?: number; completedAt?: string; updatedAt?: string }[]).filter(row => row.status === 'completed').map(row => {
      const skill = row.skill === 'reading' ? 'reading' : 'listening';
      return { id: `exam:${row.id}`, path: `/${skill}/review/${encodeURIComponent(row.id)}`, title: examAttemptTitle(row), kind: `${skill === 'reading' ? 'Reading' : 'Listening'} attempt`, Icon: skill === 'reading' ? BookOpen : Headphones, run: () => fb.setSkill(skill, `/${skill}/review/${encodeURIComponent(row.id)}`) };
    });
    return [...navigation, ...questions, ...topics, ...attempts, ...examAttempts, ...vocabularyEntries].filter((item) => `${item.title} ${item.kind}`.toLowerCase().includes(search)).slice(0, 12);
  }, [query, fb.state, navigate]);
  const activeIndex = Math.min(selected, Math.max(0, items.length - 1));
  useEffect(() => { document.getElementById(`command-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' }); }, [activeIndex, query, items.length]);
  const choose = (item: SearchItem) => { onClose(); if (item.path) navigateWithPracticeGuard(item.path, item.run); else item.run(); };
  return <ModalFrame open={open} onClose={onClose} title="Search Fieldbook"><div className="modal command-modal">
    <div className="command-input"><Search size={20} /><input autoFocus role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0} aria-label="Search Fieldbook" placeholder="Search your workspace" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); }} aria-controls="command-results" aria-activedescendant={items[activeIndex] ? `command-${activeIndex}` : undefined} onKeyDown={(e) => {
      if (e.defaultPrevented || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(Math.max(0, Math.min(activeIndex + 1, items.length - 1))); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(Math.max(activeIndex - 1, 0)); }
      if (e.key === 'Enter' && items[activeIndex]) { e.preventDefault(); choose(items[activeIndex]); }
    }} /></div>
    {requirements.error ? <div className="command-load-state"><p role="alert">{requirements.error}</p><button type="button" className="btn line" onClick={requirements.retry}>Retry search</button></div> : !requirements.ready && <div className="command-load-state"><InlineLoadingState message="Loading workspace results..." onRetry={requirements.retry} retryLabel="Retry search" /></div>}
    <div className="command-results" id="command-results" role="listbox" aria-label="Search results" aria-busy={!requirements.ready}> {items.length ? items.map((item, index) => <button type="button" role="option" tabIndex={-1} aria-selected={activeIndex === index} id={`command-${index}`} key={item.id} onMouseEnter={() => setSelected(index)} onClick={() => choose(item)}><item.Icon size={18} /><span>{item.title}<small>{item.kind}</small></span></button>) : requirements.ready ? <div className="empty">No matching results.</div> : null}</div>
  </div></ModalFrame>;
}

const MOBILE_LABELS: Record<string, string> = { vocabulary: 'Vocab' };

export function MobileNavigation({ onMore, onSelectModule }: { onMore: () => void; onSelectModule?: (id: string) => void }) {
  const fb = useFieldbook();
  const [studyOpen, setStudyOpen] = useState(false);
  const selectingStudy = useRef(false);
  const studyTrigger = useRef<HTMLButtonElement>(null);
  const [pendingStudy, setPendingStudy] = useState<{ id: string; to: string } | null>(null);
  const { pathname, search } = useLocation();
  const activeModule = moduleFor(pathname, search, fb.activeSkill);
  const navigate = useNavigate();
  const select = (id: string, to: string) => {
    if (onSelectModule) { onSelectModule(id); return; }
    if (activeModule === id) return;
    navigateWithPracticeGuard(to, () => ['writing', 'speaking', 'reading', 'listening'].includes(id) ? fb.setSkill(id, to) : navigate(to));
  };
  const skills = ['listening', 'reading', 'writing', 'speaking'].map(id => workspaceModules.find(link => link.id === id)!);
  const activeSkill = skills.find(link => link.id === activeModule);
  useEffect(() => {
    if (studyOpen || !pendingStudy) return;
    setPendingStudy(null);
    // Restore a stable keyboard destination before a no-op, guard dialog or route can take focus.
    studyTrigger.current?.focus({ preventScroll: true });
    select(pendingStudy.id, pendingStudy.to);
  }, [studyOpen, pendingStudy]);
  const mainLink = (id: string) => {
    const { to, label, Icon } = workspaceModules.find(link => link.id === id)!;
    return <Link key={id} to={to} aria-current={activeModule === id ? 'page' : undefined} className={activeModule === id ? 'active' : undefined} aria-label={label} data-practice-navigation onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); select(id, to); }}><Icon size={20} aria-hidden="true"/><span>{MOBILE_LABELS[id] || label}</span></Link>;
  };
  return <nav className="mobile-navigation" aria-label="Main navigation">
    {mainLink('today')}{mainLink('planning')}
    <DropdownMenu.Root open={studyOpen} onOpenChange={open => { if (open) selectingStudy.current = false; setStudyOpen(open); }}>
      <DropdownMenu.Trigger ref={studyTrigger} type="button" className={activeSkill ? 'active' : undefined} aria-current={activeSkill ? 'page' : undefined} aria-label={activeSkill ? `Practice: ${activeSkill.label}` : 'Practice'}><BookOpen size={20} aria-hidden="true"/><span>Practice</span></DropdownMenu.Trigger>
      {studyOpen && <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content mobile-study-menu" side="top" align="center" sideOffset={12} collisionPadding={12} onCloseAutoFocus={event => { if (selectingStudy.current) event.preventDefault(); }}>
        {skills.map(({id,to,label,Icon}) => <DropdownMenu.Item key={id} className="dropdown-item" aria-current={activeModule === id ? 'page' : undefined} onSelect={() => { selectingStudy.current = true; setStudyOpen(false); setPendingStudy({id,to}); }}><Icon size={18} aria-hidden="true"/>{label}{activeModule === id && <Check className="item-check" size={16} aria-hidden="true"/>}</DropdownMenu.Item>)}
      </DropdownMenu.Content></DropdownMenu.Portal>}
    </DropdownMenu.Root>
    {mainLink('vocabulary')}
    <button type="button" className={['progress', 'settings', 'account'].includes(activeModule) ? 'active' : undefined} aria-current={['progress', 'settings', 'account'].includes(activeModule) ? 'page' : undefined} onClick={onMore}><MoreHorizontal size={20} aria-hidden="true"/><span>More</span></button>
  </nav>;
}
