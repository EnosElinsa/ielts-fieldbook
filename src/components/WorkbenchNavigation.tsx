// @ts-nocheck
import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BookOpen, Check, ChevronDown, House, Library, LogOut, Monitor, Moon, MoreHorizontal, PencilLine, Search, Settings2, Sun, Upload, Download, ShieldCheck, MessageSquare, ChartNoAxesCombined, Mic2, NotebookTabs } from 'lucide-react';
import { ModalFrame } from './ModalFrame';
import { useTheme } from '../context/ThemeContext';
import { useFieldbook } from '../context/FieldbookContext';
import { AccountMark } from '../features/account/AccountMark';
import { signOut } from '../auth/AuthGate';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';

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
      ['Today', '/', House], ['Writing', '/write', PencilLine], ['Writing questions', '/write/questions', Library],
      ['Speaking', '/speak', Mic2], ['Speaking questions', '/speak/questions', Library], ['Review', '/review', BookOpen], ['Vocabulary', '/vocabulary', NotebookTabs], ['Progress', '/progress', ChartNoAxesCombined],
    ].map(([title, path, Icon]) => ({ id: path, path, title, kind: 'Page', Icon, run: () => { if (path.startsWith('/write')) fb.setSkill('writing', path); else if (path.startsWith('/speak')) fb.setSkill('speaking', path); else navigate(path); } }));
    const questions = fb.state.questions.map((q) => ({ id: `w:${q.id}`, path: '/write', title: q.name, kind: 'Writing question', Icon: PencilLine, run: () => { fb.setSkill('writing', '/write'); fb.chooseQuestion(q.id); } }));
    const topics = fb.state.speakingTopics.map((q) => ({ id: `s:${q.id}`, path: `/speak/topics/${q.id}`, title: q.title, kind: 'Speaking topic', Icon: Library, run: () => { fb.setSelectedTopicId(q.id); fb.setSkill('speaking', `/speak/topics/${q.id}`); } }));
    const attempts = fb.state.sessions.map((s) => ({ id: `a:${s.id}`, path: '', title: s.name, kind: 'Your attempt', Icon: BookOpen, run: () => { fb.setViewedSession(s); fb.openModal('history'); } }));
    const vocabularyEntries = fb.state.vocabulary.filter(p => !p.tags?.includes('archived')).map((p) => ({ id: `v:${p.id}`, path: `/vocabulary/entry/${p.id}`, title: p.term, kind: 'Vocabulary entry', Icon: BookOpen, run: () => navigate(`/vocabulary/entry/${p.id}`) }));
    const search = query.trim().toLowerCase();
    return [...navigation, ...questions, ...topics, ...attempts, ...vocabularyEntries].filter((item) => !search || `${item.title} ${item.kind}`.toLowerCase().includes(search)).slice(0, 12);
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

export function MobileNavigation({ onMore }: { onMore: () => void }) {
  const fb = useFieldbook();
  const { pathname } = useLocation();
  return <nav className="mobile-navigation" aria-label="Main navigation">
    <NavLink to="/" end><House size={20} /><span>Today</span></NavLink>
    <button type="button" className={pathname.startsWith('/write') ? 'active' : undefined} onClick={() => navigateWithPracticeGuard('/write', () => fb.setSkill('writing', '/write'))}><PencilLine size={20} /><span>Writing</span></button>
    <button type="button" className={pathname.startsWith('/speak') || pathname === '/stories' ? 'active' : undefined} onClick={() => navigateWithPracticeGuard('/speak', () => fb.setSkill('speaking', '/speak'))}><Mic2 size={20} /><span>Speaking</span></button>
    <NavLink to="/vocabulary"><NotebookTabs size={20} /><span>Vocabulary</span></NavLink>
    <button type="button" onClick={onMore}><MoreHorizontal size={20} /><span>More</span></button>
  </nav>;
}
