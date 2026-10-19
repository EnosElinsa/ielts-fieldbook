import { normalizeVocabularyRoute } from '../domain/vocabulary/identities';

export function safeVocabularyReturn(
  value: string | null,
  fallback = "/vocabulary",
) {
  if (!value || /[\r\n\\]/.test(value)) return fallback;
  try {
    const path = value.split(/[?#]/)[0];
    const decoded = decodeURIComponent(path);
    if (decoded.split('/').some(segment => segment === '.' || segment === '..') || decoded.includes('\\')) return fallback;
    if (!/^\/(?:vocabulary(?:\/[^?#]*)?|planning|today)?$/.test(path)) return fallback;
    return normalizeVocabularyRoute(value);
  } catch { return fallback; }
}
