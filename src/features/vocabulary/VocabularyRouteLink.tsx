import type { MouseEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams, type LinkProps, type Location } from 'react-router-dom';
import { accountId } from '../../storage/remote';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { rememberVocabularyPosition, safeVocabularyReturn } from './vocabularyNavigation';
import { normalizeVocabularyRoute } from '../../domain/vocabulary/identities';

type ReturnOrigin = {
  owner: string | null;
  url: string;
  index?: number;
  parent?: ReturnOrigin;
};

function readOrigin(value: unknown, depth = 0): ReturnOrigin | undefined {
  if (!value || typeof value !== 'object' || depth >= 12) return;
  const row = value as ReturnOrigin;
  if (row.owner !== accountId() || !row.url || !safeVocabularyReturn(row.url, '')) return;
  return {
    owner: row.owner, url: normalizeVocabularyRoute(row.url),
    ...(Number.isInteger(row.index) && row.index! >= 0 ? {index: row.index} : {}),
    parent: readOrigin(row.parent, depth + 1),
  };
}

/** Keep navigation provenance in the browser entry, separate from learner data. */
export function vocabularyForwardState(location: Location) {
  const index = window.history.state?.idx;
  return { vocabularyReturn: {
    owner: accountId(), url: normalizeVocabularyRoute(location.pathname + location.search + location.hash),
    ...(Number.isInteger(index) ? {index} : {}),
    parent: readOrigin(location.state?.vocabularyReturn),
  } satisfies ReturnOrigin };
}

export function vocabularyReturnLabel(url: string) {
  const path = url.split(/[?#]/)[0];
  if (path === '/planning') return 'Back to Planning';
  if (path === '/' || path === '/today') return 'Back to Today';
  if (path === '/vocabulary/history') return 'Back to history';
  if (/^\/vocabulary\/history\//.test(path)) return 'Back to session word list';
  if (/\/groups\/[^/]+\/learn$/.test(path)) return 'Back to learning cards';
  if (/\/groups\/[^/]+\/words$/.test(path)) return 'Back to group words';
  if (/^\/vocabulary\/wordbooks\//.test(path)) return 'Back to wordbook';
  if (path === '/vocabulary/wordbooks') return 'All wordbooks';
  if (/^\/vocabulary\/entry\//.test(path)) return 'Back to word details';
  if (path === '/vocabulary/words') return 'Back to my words';
  if (path === '/vocabulary/study') return 'Back to assessment setup';
  if (path === '/vocabulary/review') return 'Back to vocabulary review';
  return 'Back to vocabulary';
}

export function useVocabularyReturn(fallback = '/vocabulary') {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const origin = readOrigin(location.state?.vocabularyReturn);
  const current = location.pathname + location.search + location.hash;
  const to = origin?.url !== current && origin?.url || safeVocabularyReturn(params.get('returnTo'), fallback);
  const goBack = () => {
    const latest = readOrigin(location.state?.vocabularyReturn);
    const index = window.history.state?.idx;
    const restored = location.state?.workspaceModuleRestore;
    const resumedModule = restored?.owner === accountId() && Boolean(safeVocabularyReturn(restored?.url, '')) && latest?.index === undefined;
    if (!resumedModule && latest && latest.url !== current) {
      // Pop to the real source entry, including any intermediate practice replacements.
      if (latest.index === undefined) { navigate(-1); return; }
      if (Number.isInteger(index) && index > latest.index) { navigate(latest.index - index); return; }
    }
    // New tabs and direct URLs have no owned history entry to pop.
    navigate(to, {replace: true, state: {vocabularyReturn: latest?.parent, vocabularyRestore: true, ...(resumedModule ? {workspaceModuleRestore: {owner: accountId(), url: to}} : {})}});
  };
  return {to, label: vocabularyReturnLabel(to), goBack};
}

export function VocabularyLink({preserveReturn = false, ...props}: LinkProps & {preserveReturn?: boolean}) {
  const location = useLocation();
  const to = typeof props.to === 'string' ? normalizeVocabularyRoute(props.to) : props.to;
  return <Link {...props} to={to} state={props.state ?? (preserveReturn ? location.state : vocabularyForwardState(location))} onClick={event=>{
    rememberVocabularyPosition(location.pathname + location.search + location.hash, event.currentTarget.id);
    props.onClick?.(event);
  }}/>;
}

export function VocabularyBackLink({fallback, label, className = 'btn text'}: {fallback?: string; label?: string; className?: string}) {
  const back = useVocabularyReturn(fallback);
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    navigateWithPracticeGuard(back.to, back.goBack);
  }
  return <Link className={className} to={back.to} data-practice-navigation onClick={onClick}><ArrowLeft size={15}/>{label || back.label}</Link>;
}
