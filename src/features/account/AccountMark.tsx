import { avatarLetters, type IdentityUser } from '../../lib/identity';

export function AccountMark({ user, size = 'page' }: { user: IdentityUser; size?: 'page' | 'nav' }) {
  const className = size === 'nav' ? 'avatar avatar-nav' : 'avatar';
  return (
    <span className={className} aria-hidden="true">
      {avatarLetters(user)}
    </span>
  );
}
