# Account lifecycle and today's lead

Two parts. The account page can start an email change and can delete the login. Today names a missing exam date. A failed save stays on screen until the next save succeeds.

## Email change

The account page gains an Email address panel beside the existing name and password panels. The signed-in address stays in the metric at the top.

Saving calls `updateUser` with the trimmed address and `emailRedirectTo: window.location.origin`. An empty address shows `Enter an email.` and does not call `updateUser`. An address that already matches the signed-in email does not call `updateUser` and does not show a pending line. The current email keeps working until the session user's email becomes the new address. After a successful call, the panel shows `Confirmation sent.` and the address that was submitted. That pending line remains until `user.email` matches it, compared with trimmed case-insensitive text. A failed call shows `authError` and does not show a pending address.

An address that is already registered, and a rate limit, use the sentences already in `src/auth/errors.ts`.

## Delete account

The account page gains a Delete account panel. The note says essays, recordings, and the login are removed, and this email can be used to register again.

The delete button stays disabled until the typed value matches the signed-in email. Matching ignores surrounding spaces and letter case. A non-empty value that does not match shows `Type the email shown above.`

The click calls the database function `delete_own_account`. The browser does not receive the service role key. On success the client signs out and the sign-in screen returns. On failure the session stays and the panel shows `Could not delete this account. Try again.`

`delete_own_account` is `security definer`, with a fixed `search_path`, and may be executed only by `authenticated`. It refuses to run when `auth.uid()` is null. It deletes objects in the `recordings` bucket whose first folder is that user id, then deletes that row from `auth.users`. The storage delete runs while the user id still exists. Existing `on delete cascade` foreign keys remove the profile, sessions, drafts, assessments, lexicon, errors, plans, and stories. The shared question catalog stays.

The settings note that a backup JSON does not include recordings stays as it is.

## Exam date

When `settings.examDate` is empty, the Today lead says: `The exam date is not set. Set it and the daily tasks follow the exam.` A button labeled `Set exam date` opens the existing settings modal. The tasks under the lead stay usable.

When an exam date is set, the lead keeps its current sentence and does not show this prompt.

## Failed save

`Could not save to your account. Try again.` still appears in the short toast. The same sentence also stays under the page title in `Shell` until the next `saveState` returns true. `persist` and `persistNow` set that flag from the boolean they already return, including a silent save and an autosave. A successful autosave clears the line and does not toast `Draft saved.`

The line is one place in the shell, so it remains while moving among Today, Write, Speak, Review, and Phrases.

## Tests

`emailsMatch` accepts the same address with different case and surrounding spaces, and rejects a different address.

An account-page test disables Delete until the typed email matches, and does not call the function before that.

An errors test still covers the already-registered and rate-limit sentences used by the email panel.

A Today test with an empty exam date shows the new lead and the settings button. A set exam date does not show that lead.

A shell test shows the failed-save line when the flag is set, and hides it when the flag is clear.

## Out of scope

Two-device conflict display, scoring inside the app, a custom domain, and changing the Pages build command.
