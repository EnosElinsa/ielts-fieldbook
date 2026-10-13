import { BookOpen, ChartNoAxesCombined, Headphones, House, Mic2, NotebookTabs, PencilLine } from 'lucide-react';

// IELTS test order, followed by the vocabulary shared by every skill.
export const workspaceModules = [
  { id: 'today', to: '/', label: 'Today', Icon: House },
  { id: 'listening', to: '/listening', label: 'Listening', Icon: Headphones },
  { id: 'reading', to: '/reading', label: 'Reading', Icon: BookOpen },
  { id: 'writing', to: '/write', label: 'Writing', Icon: PencilLine },
  { id: 'speaking', to: '/speak', label: 'Speaking', Icon: Mic2 },
  { id: 'vocabulary', to: '/vocabulary', label: 'Vocabulary', Icon: NotebookTabs },
  { id: 'progress', to: '/progress', label: 'Progress', Icon: ChartNoAxesCombined },
] as const;

export type WorkspaceModule = typeof workspaceModules[number]['id'];

export function moduleFor(pathname: string, search: string, fallbackSkill: string) {
  if (pathname.startsWith('/reading')) return 'reading';
  if (pathname.startsWith('/listening')) return 'listening';
  if (pathname.startsWith('/write')) return 'writing';
  if (pathname.startsWith('/speak') || pathname === '/stories') return 'speaking';
  if (pathname.startsWith('/review')) {
    const skill = new URLSearchParams(search).get('skill');
    return skill === 'speaking' || skill === 'writing' ? skill : fallbackSkill === 'speaking' ? 'speaking' : 'writing';
  }
  if (pathname.startsWith('/vocabulary')) return 'vocabulary';
  if (pathname.startsWith('/progress')) return 'progress';
  if (pathname.startsWith('/account')) return 'account';
  return 'today';
}

export function studyLinkActive(to: string, pathname: string, search: string, activeModule: string) {
  const target = new URL(to, 'https://fieldbook.local');
  const query = new URLSearchParams(search);
  if (target.pathname === '/review') return pathname.startsWith('/review') && target.searchParams.get('skill') === activeModule;
  if (target.searchParams.get('mode') === 'intensive') return pathname.startsWith('/listening/intensive') || (pathname === '/listening' && query.get('mode') === 'intensive');
  if (target.pathname.endsWith('/review')) return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
  if (target.pathname === '/reading' || target.pathname === '/listening') return pathname === target.pathname && query.get('mode') !== 'intensive';
  return pathname === target.pathname;
}
