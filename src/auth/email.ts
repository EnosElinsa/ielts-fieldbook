export function emailsMatch(typed: string | null | undefined, current: string | null | undefined) {
  const left = String(typed || '').trim().toLowerCase();
  const right = String(current || '').trim().toLowerCase();
  return Boolean(left) && left === right;
}
