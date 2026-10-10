export type PracticeNavigationRequest = {
  path: string;
  proceed: () => void;
};

export function navigateWithPracticeGuard(path: string, proceed: () => void): boolean {
  const event = new CustomEvent<PracticeNavigationRequest>('fieldbook:before-navigate', {
    cancelable: true,
    detail: { path, proceed },
  });
  document.dispatchEvent(event);
  if (!event.defaultPrevented) proceed();
  return !event.defaultPrevented;
}
