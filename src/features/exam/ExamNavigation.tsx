import type { MouseEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams, type LinkProps } from 'react-router-dom';
import { accountId } from '../../storage/remote';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';

/** Return addresses travel with a study URL, so refreshes and new tabs keep them. */
export function safeExamReturn(value: unknown, fallback = ''): string {
  if (typeof value !== 'string' || value.length > 12000 || /[\s\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://fieldbook.local');
    if (url.origin !== 'https://fieldbook.local' || url.pathname + url.search + url.hash !== value) return fallback;
    const path = decodeURIComponent(url.pathname);
    if (/[\s\\]/.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) return fallback;
    return /^\/(?:listening|reading)(?:\/(?:review|source|intensive|mock)\/[^/?#]+|\/[^/?#]+)?$/.test(path) ? value : fallback;
  } catch { return fallback; }
}

export function ExamStudyLink({ to, returnHash, ...props }: Omit<LinkProps, 'to'> & { to: string; returnHash?: string }) {
  const location = useLocation();
  const sourceUrl = location.pathname + location.search + location.hash;
  const origin = location.pathname + location.search + (returnHash ?? location.hash);
  const destination = new URL(to, 'https://fieldbook.local');
  destination.searchParams.set('returnTo', origin);
  return <Link {...props} to={destination.pathname + destination.search + destination.hash} state={{
    ...props.state,
    examReturn: { owner: accountId(), url: origin, sourceUrl, index: window.history.state?.idx },
  }} />;
}

export function ExamBackLink({ fallback, fallbackLabel = 'Back to practice' }: { fallback: string; fallbackLabel?: string }) {
  const owner = accountId();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const current = location.pathname + location.search + location.hash;
  const requested = safeExamReturn(params.get('returnTo'));
  const to = requested && requested !== current ? requested : fallback;
  const path = to.split(/[?#]/)[0];
  const label = to === fallback ? fallbackLabel : /\/review\//.test(path) ? 'Back to review' : /\/source\//.test(path) ? 'Back to source' : /\/intensive\//.test(path) ? 'Back to intensive listening' : 'Back to practice';
  const goBack = () => {
    if (accountId() !== owner) return;
    const origin = location.state?.examReturn;
    const index = window.history.state?.idx;
    // Pop only when it leads to this exact address in this account's history.
    // A resumed module or a question anchor uses the explicit URL instead.
    if (!location.state?.workspaceModuleRestore && origin?.owner === accountId() && origin.url === to && origin.sourceUrl === to && Number.isInteger(origin.index) && origin.index >= 0 && Number.isInteger(index) && index > origin.index) {
      navigate(origin.index - index);
    } else navigate(to, { replace: true });
  };
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    navigateWithPracticeGuard(to, goBack);
  };
  return <Link className="btn text back-link" to={to} data-practice-navigation onClick={onClick}><ArrowLeft size={16} aria-hidden="true" />{label}</Link>;
}
