# Reading and listening implementation

Approved scope: Cambridge IELTS Academic 8–21, 56 tests, 224 listening parts and 168 reading passages. Content is shared and read-only; responses, evidence, recordings and review schedules belong to each account. The user confirmed authorized internal source use and logged into the source acquisition browser.

Implemented:

- Schema v11, five shared catalog tables, two private learning tables, RLS and private source asset storage.
- Authenticated resumable collection, normalized question types and pooled multiple-choice marks, HTML sanitization, media mirroring, provenance and content hashes.
- Reading and listening banks, part practice, full mocks, source evidence, method notes, grading, saved reviews and mistake retries.
- Intensive listening with sentence WaveSurfer playback, speed, A/B loops, dictation differences, microphone recording, self-rating, blind replay and delayed recall. Prior cycles remain in history; new recall starts blank.
- Four-skill navigation, settings, Today recommendations, plans, separate practice/mock statistics, backup migration, sync and account deletion.
- CPU forced alignment using the supplied transcript; generated timing has explicit provenance and can be manually corrected.

Validation: all 392 source units collected; 4,480 answer slots; all source audio and diagrams mirrored. Browser smoke used real source content with an isolated mocked account store, including reading submission, pause/resume, listening submission, wrong-answer sentence navigation, shadowing upload, blind replay, fresh recall, mobile navigation, progress and mock submission. Component tests exercise storage failures and denied microphones. Full tests and production build must be rerun after final edits.

Release completed on October 12: migration and final v4 catalog/media seed applied; commit `ff3462b` merged/pushed to `master`; GitHub Check, Supabase Preview and Cloudflare Pages passed. Live account isolation and primary production reading/listening/intensive/progress workflows were verified with temporary accounts, which were removed afterward. Full verification passed 602 tests and the production build. Source gaps are recorded in `docs/exam-readiness-audit.json`; they are never replaced with invented explanations or timestamps.
