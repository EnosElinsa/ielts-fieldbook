// @ts-nocheck
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BookOpen, Check, ChevronDown, House, Library, LogOut, Monitor, Moon, MoreHorizontal, PencilLine, Search, Settings2, Sun, Upload, Download, ShieldCheck, MessageSquare, ChartNoAxesCombined, Mic2, NotebookTabs, Headphones } from 'lucide-react';
import { ModalFrame } from './ModalFrame';
import { useTheme } from '../context/ThemeContext';
import { useFieldbook } from '../context/FieldbookContext';
import { AccountMark } from '../features/account/AccountMark';
import { signOut } from '../auth/AuthGate';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';
import { moduleFor, workspaceModules } from './workspaceNavigation';

export function AccountMenu({ user, onImportBackup, onExportBackup, onLegal }: { user: unknown; onImportBackup: () => void; onExportBackup: () => void; onLegal: (view: string) => void }) {
  const fb = useFieldbook();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="account-menu-trigger" aria-label="Account menu"><AccountMark user={user} size="nav" /><ChevronDown size={14} /></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" sideOffset={8} align="end">
        <DropdownMenu.Label className="dropdown-label">Your workspace</DropdownMenu.Label>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => navigateWithPracticeGuard('/account', () => navigate('/account'))}><BookOpen size={16} />Account</DropdownMenu.Item>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => fb.openModal('settings')}><Settings2 size={16} />Study settings</DropdownMenu.Item>
        <DropdownMenu.Separator className="dropdown-separator" />
        <DropdownMenu.Label className="dropdown-label">Appearance</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={theme} onValueChange={setTheme}>
          {[['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']].map(([value, Icon, label]) => <DropdownMenu.RadioItem className="dropdown-item" key={value} value={value}><Icon size={16} />{label}<DropdownMenu.ItemIndicator className="item-check"><Check size={15} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
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
  const items = useMemo(() => {
    const navigation = [
      ...workspaceModules.map(({ label, to, Icon }) => [label, to, Icon]),
      ['Listening review', '/listening/review', Headphones], ['Intensive listening', '/listening?mode=intensive', Headphones],
      ['Reading review', '/reading/review', BookOpen], ['Writing questions', '/write/questions', Library],
      ['Speaking questions', '/speak/questions', Library], ['Writing review', '/review?skill=writing', BookOpen], ['Speaking review', '/review?skill=speaking', BookOpen],
    ].map(([title, path, Icon]) => ({ id: path, path, title, kind: 'Page', Icon, run: () => { const module = moduleFor(path.split('?')[0], path.includes('?') ? path.slice(path.indexOf('?')) : '', fb.activeSkill); if (['writing', 'speaking', 'reading', 'listening'].includes(module)) fb.setSkill(module, path); else navigate(path); } }));
    const questions = fb.state.questions.map((q) => ({ id: `w:${q.id}`, path: '/write', title: q.name, kind: 'Writing question', Icon: PencilLine, run: () => { fb.setSkill('writing', '/write'); fb.chooseQuestion(q.id); } }));
    const topics = fb.state.speakingTopics.map((q) => ({ id: `s:${q.id}`, path: `/speak/topics/${q.id}`, title: q.title, kind: 'Speaking topic', Icon: Library, run: () => { fb.setSelectedTopicId(q.id); fb.setSkill('speaking', `/speak/topics/${q.id}`); } }));
    const attempts = fb.state.sessions.map((s) => ({ id: `a:${s.id}`, path: '', title: s.name, kind: 'Your attempt', Icon: BookOpen, run: () => { fb.setViewedSession(s); fb.openModal('history'); } }));
    const vocabularyEntries = fb.state.vocabulary.filter(p => !p.tags?.includes('archived')).map((p) => ({ id: `v:${p.id}`, path: `/vocabulary/entry/${p.id}`, title: p.term, kind: 'Vocabulary entry', Icon: BookOpen, run: () => navigate(`/vocabulary/entry/${p.id}`) }));
    const examAttempts = (fb.state.examAttempts || []).filter(row => row.status === 'completed').map(row => ({ id: `exam:${row.id}`, path: `/${row.skill}/review/${encodeURIComponent(row.id)}`, title: row.sourceId, kind: `${row.skill === 'reading' ? 'Reading' : 'Listening'} attempt`, Icon: row.skill === 'reading' ? BookOpen : Headphones, run: () => fb.setSkill(row.skill, `/${row.skill}/review/${encodeURIComponent(row.id)}`) }));
    const search = query.trim().toLowerCase();
    return [...navigation, ...questions, ...topics, ...attempts, ...examAttempts, ...vocabularyEntries].filter((item) => !search || `${item.title} ${item.kind}`.toLowerCase().includes(search)).slice(0, search ? 12 : navigation.length);
  }, [query, fb.state, navigate]);
  const choose = (item) => { onClose(); if (item.path) navigateWithPracticeGuard(item.path, item.run); else item.run(); };
  return <ModalFrame open={open} onClose={onClose} title="Search Fieldbook"><div className="modal command-modal">
    <div className="command-input"><Search size={20} /><input autoFocus aria-label="Search Fieldbook" placeholder="Search your workspace" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); }} aria-controls="command-results" aria-activedescendant={items[selected] ? `command-${selected}` : undefined} onKeyDown={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((v) => Math.min(v + 1, items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((v) => Math.max(v - 1, 0)); }
      if (e.key === 'Enter' && items[selected]) { e.preventDefault(); choose(items[selected]); }
    }} /></div>
    <div className="command-results" id="command-results" role="listbox" aria-label="Search results">{items.length ? items.map((item, index) => <button type="button" role="option" aria-selected={selected === index} id={`command-${index}`} key={item.id} onMouseEnter={() => setSelected(index)} onClick={() => choose(item)}><item.Icon size={18} /><span>{item.title}<small>{item.kind}</small></span></button>) : <div className="empty">No matching results.</div>}</div>
  </div></ModalFrame>;
}

export function MobileNavigation({ onMore, onSelectModule }: { onMore: () => void; onSelectModule?: (id: string) => void }) {
  const fb = useFieldbook();
  const { pathname, search } = useLocation();
  const activeModule = moduleFor(pathname, search, fb.activeSkill);
  const navigate = useNavigate();
  const select = (id, to) => {
    if (onSelectModule) { onSelectModule(id); return; }
    if (activeModule === id) return;
    navigateWithPracticeGuard(to, () => ['writing', 'speaking', 'reading', 'listening'].includes(id) ? fb.setSkill(id, to) : navigate(to));
  };
  return <nav className="mobile-navigation" aria-label="Main navigation">
    {workspaceModules.filter(link => link.id !== 'progress').map(({ id, to, label, Icon }) => id === 'today' || id === 'vocabulary' ? <Link key={id} to={to} aria-current={activeModule === id ? 'page' : undefined} className={activeModule === id ? 'active' : undefined} aria-label={label} data-practice-navigation onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); select(id, to); }}><Icon size={20} /><span>{label === 'Vocabulary' ? 'Vocab' : label}</span></Link> : <button key={id} type="button" aria-current={activeModule === id ? 'page' : undefined} className={activeModule === id ? 'active' : undefined} onClick={() => select(id, to)}><Icon size={20} /><span>{label}</span></button>)}
    <button type="button" onClick={onMore}><MoreHorizontal size={20} /><span>More</span></button>
  </nav>;
}
