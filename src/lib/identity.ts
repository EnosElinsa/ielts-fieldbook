export type IdentityUser = {
  email?: string | null;
  user_metadata?: { display_name?: unknown } | null;
} | null;

export function displayNameOf(user: IdentityUser) {
  const stored = user?.user_metadata?.display_name;
  if (typeof stored === 'string' && stored.trim()) return stored.trim();
  const email = user?.email || '';
  return email.split('@')[0] || 'Account';
}

export function initials(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return 'A';
  const latin = trimmed.match(/[A-Za-z]/g) || [];
  if (latin.length > 0) return latin.slice(0, 2).join('').toUpperCase();
  return Array.from(trimmed)[0];
}

export function avatarLetters(user: IdentityUser) {
  if (!user) return 'A';
  return initials(displayNameOf(user));
}
