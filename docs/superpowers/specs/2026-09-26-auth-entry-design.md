# Auth entry, practice loop, and publish

Account identity is already live. This spec is the rest of the update, in three parts: auth entry, the practice loop, and publish. Each part can be implemented and checked on its own.

## Auth entry

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

Auth entry does not redesign the paper card, change the email address, or add magic-link sign-in.

## Practice loop

Today, Write, Speak, Review, and Phrases already load from `hydrateState` and write through `saveState`. A reload shows the account's drafts, attempts, scores, phrases, plans, and stories. Empty lists keep the sentences they already have, including "No essays yet.", "No speaking attempts yet.", "No scores yet.", "Nothing saved yet.", "No earlier attempts.", "Nothing spoken yet.", "No band scores yet.", and "Score not found."

`Draft saved.` is shown only after `saveState` returns true. The state update stays synchronous. The account write is awaited after that update, and `persist` / `persistNow` return its boolean. The writing desk and the speaking desk use that result for the Save draft button. A failed write shows only `Could not save to your account. Try again.` The autosave every 350ms stays quiet when it succeeds, and uses that same failure sentence when it does not.

A speaking recording still goes to the `recordings` bucket through `putAudio`. If that upload throws, the transcript is still saved and the toast is `Could not store the recording. Saving the transcript only.` The desk line is `Recordings stay on this account.` An attempt with an `audioId` loads that recording again through `getAudio` after a refresh.

`Copied into a new draft.` follows the same rule: it is shown only after the save returns true.

A test with `saveState` returning false does not toast `Draft saved.` A test with it returning true does.

## Publish

Production updates when `master` is pushed. Cloudflare Pages project `ielts-fieldbook` builds with `npm run build`, publishes `dist`, and serves [https://ielts-fieldbook.pages.dev](https://ielts-fieldbook.pages.dev). Releasing does not upload `dist` with Wrangler.

The Pages project gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables. The build command is `npm run build`. The anon key is not written into the repository. If a push still produces a bundle without the Supabase host, the build command may prefix those two variables for that one project, and the README says why.

The README deploy section tells the next person to push `master`. It does not present `npm run deploy:pages` as the way to release. A test reads `README.md` and asserts that.

A release is done when the Cloudflare Pages check for that commit says the deploy succeeded and the production site loads.

## Out of scope

A visual redesign of the auth card, changing the email address, magic-link sign-in, a custom domain, and a new empty-state illustration set.
