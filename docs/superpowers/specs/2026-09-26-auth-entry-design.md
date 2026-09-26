# Auth entry

Sign-up confirmation opens the notebook from the email link. Password reset still stops to set a new password, then opens the notebook. Error and resend sentences stay the same list the account page already uses. The paper sign-in screen stays as it is.

## Session wins

`AuthGate` already returns the notebook when `sessionState === 'in'` and recovery is false. That order stays. A confirm mailbox does not remain on screen once a session exists.

The Supabase client keeps its default URL session detection. A confirmation or recovery redirect that lands on this origin with a session hash becomes a session. `onAuthStateChange` already updates `sessionState`. Another tab in the same browser that is still on the confirm screen follows that session and opens the notebook too.

`PASSWORD_RECOVERY` still sets recovery. A session with recovery shows the existing new-password form. Saving the password clears recovery and leaves the session in place, so the notebook opens. The person stays signed in on this browser.

## Redirect

`signUp`, `resend` (`type: 'signup'`), and `resetPasswordForEmail` all set the redirect to `window.location.origin`.

`signUp` gains `options: { emailRedirectTo: window.location.origin }`. Resend and reset already pass that origin.

## Confirm screen

The confirm card keeps the paper layout, the address, and "Use a different email".

The steps become:

1. Open the message from Supabase.
2. Click the confirmation link.
3. The notebook opens in that tab.

Remove the third step "Come back here and sign in with the same password." Remove the button "I confirmed it. Sign in" from both the confirm card and the reset card.

Resend stays on the confirm card only. Success hides the button and shows `Confirmation sent.` Failure shows `authError(message, 'signup')`, including the rate-limit sentence. The button is disabled while the request is in flight.

## Reset screen

The reset card keeps its three steps: open the message, click the link, enter a new password on the page that opens. It does not show "I confirmed it. Sign in". The new-password form is unchanged: at least 6 characters, the two fields match, then `updateUser({ password })`.

## Sentences

All of these go through `authError` in `src/auth/errors.ts`. The account page and the sign-in screen import that function. One list, no second copy.

The unconfirmed-email sentence becomes: `Confirm the email first. Open the message we sent. The notebook opens from that link.`

A failed link matches `/otp_expired|email link is invalid|has expired|already been used/i`.

- `mode === 'signup'`: `This link no longer works. Send another confirmation email.`
- `mode === 'reset'`: `This link no longer works. Send another reset email.`
- any other mode: `This link no longer works. Request a new email below.`

`AuthGate` reads `error_description` and `error_code` from the hash and passes `${description} ${code}` through `authError`. It does not render the raw hash text.

When that happens with no session:

- Hash `type=signup`, or the confirm mailbox is already open: use signup mode. If the address is still on the confirm card, show Resend. If the address is empty, show the sign-in card with the signup sentence. Create an account and Forgot password stay the way they are.
- Hash `type=recovery`: use reset mode and show the reset form with the error. Sending it calls `resetPasswordForEmail` again.
- No `type`: use signin mode and show the sign-in card with `Request a new email below.`

The existing sentences stay: invalid credentials, already registered, weak password, rate limit, and the empty-message fallback.

## Tests

Update `tests/auth/errors.test.ts` for the new unconfirmed sentence and the three expired-link sentences. Keep the invalid-credentials, already-registered, weak-password, rate-limit, and empty-message cases.

A render test of the confirm mailbox shows the new third step, shows `Confirmation sent.` after a successful resend, and does not contain `I confirmed it. Sign in`. The reset mailbox does not contain that button either.

## Out of scope

Practice-loop save failures, empty states, the Pages build environment variables, a visual redesign of the auth card, changing the email address, and magic-link sign-in.
