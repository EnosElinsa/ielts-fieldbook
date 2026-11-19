# Learning card scrolling and spacing

The learning card and batch list contained page scrolling with
`overscroll-behavior: contain`. On browsers that enforce containment for a
non-overflowing scroll container, a wheel gesture over a short definition did
nothing even though the surrounding page could scroll. The same rule trapped
gestures at the end of longer content. Buttons remained usable because no click
handler was affected.

Both reading regions now use native scroll chaining. Long content still scrolls
inside the card above the stable word navigation row. The stage height cap is
reduced from 54rem to 44rem; its viewport sizing and mobile rules remain in use.
With the same ceiling entry at 2560 by 1270, the measured gap between Word details
and the navigation row decreased from about 207px to 47px. This retains a stable
action row when switching between short and long definitions.

## Browser regression

Use an intercepted synthetic account and the ceiling entry in chapter 13 of
IELTS Vocabulary. Keep scripts, screenshots and account fixtures outside the
checkout, as required by the contribution guide.

1. At 2560x1270, 1440x900, 390x844 and 320x700, check both light and dark themes.
   Place the pointer over the card with room to scroll the document. A fresh
   downward wheel gesture at the card's bottom must move the page. At the top,
   an upward gesture must move the page upward. The original CSS fails the
   short-card downward regression.
2. Add long synthetic prose only to the rendered card. Starting at its top,
   scrolling must move the inner content while the page and navigation row stay
   still. Reach the bottom using wheel input, then verify that a fresh gesture
   scrolls the page. Native input avoids a Chromium fractional-pixel difference
   between a script-assigned scrollTop and the compositor's scroll endpoint.
3. Switch to Recall first. Meaning stays concealed and Mark viewed stays disabled
   until Reveal meaning is pressed. Navigate forward and back; the card resets
   its internal scroll position.
4. Switch to List and repeat the bottom-boundary page-scroll check. Return to
   Cards. Verify no horizontal overflow or browser errors at every size.

Physical touchpad and phone gestures still require device acceptance: repeat
steps 1, 2 and 4 with native scrolling on those devices. No event interception,
new dependency, persisted state or data migration is introduced by this fix.

## Validation results

- Full suite: 251 files passed; 18,410 tests passed and one skipped.
- Production build passed. Bundle checks passed: login JavaScript gzip 193,585
  bytes; largest JavaScript asset 387,815 bytes.
- Dictionary audit, vocabulary quality snapshot and identity/SQL compatibility
  checks passed.
- All eight size/theme scenarios passed in Chromium, Firefox and WebKit; the
  eight Chromium scenarios also passed against the production build preview.
  These runs used synthetic accounts and reported no browser errors or
  horizontal overflow.
- Independent read-only review found no actionable issues.

Final local command logs are in the ignored
`local/logs/2026-11-18-learning-card-scroll/` directory. Detailed browser evidence
is retained outside the checkout.
