import type { RefObject } from 'react';

export function SkipToContent({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  // This moves focus within the page; active-practice departure guards must let it through.
  return <a className="skip-link" href="#workspace-content" data-practice-navigation onClick={(event) => {
    event.preventDefault();
    targetRef.current?.focus();
  }}>Skip to main content</a>;
}
