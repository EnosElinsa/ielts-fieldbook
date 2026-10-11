# Reading and listening content operations

The bank contains Cambridge IELTS 8–21 material collected from the user's signed-in ieltscb.com account. The user stated that this material is authorized for their internal use. That statement is recorded in each row's provenance; it is not an independently verified open-content license. Retain the source URL, fetched timestamp, source version, content hash and authorization statement when copying or correcting a row. Full passages, questions, transcripts and media stay under ignored `local/` storage or the authenticated Supabase catalog. The public metadata file contains titles and section availability only.

## Source collection and normalization

Sign in through the source browser and export its Playwright storage state to `local/exam-source/browser-state.json`. This file contains session credentials. Keep it local, never include it in an issue, commit, shared bank or upload. The collector reads the cookie without printing it and removes source account answers and learning records from the export. Existing complete raw section files are reused.

```powershell
node scripts/collect-exams.mjs local/exam-source/browser-state.json
node scripts/import-exams.mjs
```

Collection writes `local/exam-source/directory.json`, `raw/` and `collection-report.json`. Normalization and media download write `local/exam-bank/catalog.json`, `metadata.json`, `sections/`, `assets/` and `audit.json`. The importer uses four download workers and probes audio with `ffprobe`; install FFmpeg and make both `ffmpeg` and `ffprobe` available on PATH. Browser state and media are not bundled into the public frontend.

The original answer key remains authoritative. Text answers retain source alternatives and word limits. Multiple selections pool distinct correct options from every source row in a group. Map and flow-chart tasks can use either choice labels or text blanks; retain supplied options and source instructions. Shared rich stimulus HTML is sanitized, its images are mirrored, and source URLs become `exam-asset:<asset-id>` references. Do not replace missing material with invented passages, questions, answer keys or timestamps.

Inspect `audit.json` after every import. An error is a release blocker. Missing or invalid sentence timing is a warning: full-part listening can remain available, but the intensive sentence loop must explain when exact timing is unavailable. A missing answer, passage, transcript, required image or audio is mandatory content failure. Verify pooled-choice groups and at least one question of each source type against the signed-in source before deployment.

Observed local inventory on 12 October 2026:

| Item | Count |
| --- | ---: |
| Papers | 56 |
| Listening sections | 224 |
| Reading passages/sections | 168 |
| Normalized question groups | 4,339 |
| Answer slots | 4,480 |
| Transcript sentences | 10,146 |
| Mirrored assets | 248 |
| Asset bytes | 1,634,448,805 |
| Sentences missing valid timing | 132 |

At that audit, all 248 assets were present, with no importer failures or catalog errors. Timing validation also checks the measured audio duration: 62 sentences had missing/invalid intervals and another 70 extended past the audio. These are observed counts, not assumptions enforced by a synthetic source fixture. Re-run the audit and seed dry run after any correction; checksums will change.

The CPU forced-alignment pass completed against that frozen bank: 121 of the 132 gaps received generated timestamps. A subsequent computational review filled the remaining 11 intervals using independent local ASR word diagnostics, bounded forced alignment of the source text and adjacent transcript checks. The final separate `local/exam-bank-final-v4/` package contains 392 section bundles, zero missing/invalid intervals, an audit and `reviewed-times.json` with review methods, limitations and diagnostic hashes. It contains 120 generated and 26 corrected intervals: 11 formerly invalid timings and 15 explicitly reviewed overlapping, overlong or reversed intervals. One initially generated interval received a reviewed correction. The earlier `local/exam-bank-aligned/` package is retained as an immutable intermediate input. Original source text and all 4,339 answer keys were preserved. Generated timing has provenance and remains subject to listening review; it is not relabeled as original source timing.

After alignment, the full original-language source rationale was restored for 4,330 question groups in the optional `sourceExplanation` field. Review displays this source detail separately from the English evidence/paraphrase summary; it is neither translated nor substituted for the answer key. Nine groups have no original detailed rationale, and seven groups have no English explanation. The current aligned catalog SHA-256 is `8dd491d4e0770336e7b529218af562ccdc1b76e77923e659597a88ff8bc82da0`; the current unaligned source catalog SHA-256 is `fc0d401d18d330cb952985634ad7769b2fce0f738ee2517b61423cebb4d84772`. The immutable alignment-input/output and pre-review hashes remain separately recorded in the readiness audit: explanation preservation changed packaged bytes after alignment without changing source answers or timing.

Seven question groups lack English explanations in the source export. Their original answer keys remain present. Keep the review message when an explanation is unavailable; do not manufacture explanatory quotes.

## Dry run and administrator seed

Apply `supabase/migrations/20261011120000_exam_practice.sql` through the normal administrator migration process first. It creates shared read-only authenticated catalog tables, private account-owned practice tables and the private `exam-assets` bucket. Account users cannot upload source material. Account deletion cascades to their attempts and intensive sessions.

```powershell
node scripts/seed-exams.mjs --dry-run --manifest local/exam-bank/seed-manifest.json
```

Dry run is the default and does not connect to Supabase. It validates the catalog, saved audit, required material, provenance, asset paths, nonempty local asset files and absence of account credentials/answers. The output records table counts, answer slots, SHA-256 of the catalog, asset byte count and a combined checksum of every asset's path and content. Missing timing remains visible in warnings. Use the manifest to review the concrete deployment payload.

To upload after reviewing the manifest, provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through the deployment environment or the ignored `.env.local`/`.env` file. Existing environment variables take precedence. Never expose the service-role key as a `VITE_` variable or place it in browser code. The script prints no credentials or endpoint.

```powershell
node scripts/seed-exams.mjs --apply
```

The explicit apply mode uploads media to the private bucket before seeding catalog tables. It upserts batches of at most 100 rows with no more than four workers. It never prunes unrelated or older rows and never edits private study history. A failed run can retry the same IDs and paths. Apply is not a single database transaction; a failure can leave some catalog tables updated. Re-run to finish, then verify authenticated reads and signed audio/image URLs. Production assets resolve through short-lived signed URLs. Development may use the local Vite overlay; shipping the public frontend alone does not publish the private bank.

Alternate bank paths are supported:

```powershell
node scripts/seed-exams.mjs --catalog local/exam-bank/catalog-aligned.json --assets local/exam-bank/assets --audit local/exam-bank/audit.json --dry-run
```

## Optional sentence alignment

Prefer valid source timing. For the remaining gaps, the alignment tool can import reviewed timestamps or use local CPU WhisperX forced alignment against the existing source transcript. It never asks an ASR model to invent the transcript and never changes answers. Model downloads may occur on the first WhisperX use; the tool runs alignment locally after those dependencies are available.

Inspect the remaining work without loading WhisperX:

```powershell
python scripts/align-exams.py --catalog local/exam-bank/catalog.json --assets local/exam-bank/assets --output local/exam-bank/catalog-aligned.json --dry-run
```

For CPU forced alignment, use a separate Python 3.12 virtual environment with a compatible CPU PyTorch and WhisperX installation. The frontend and seed workflow do not need this optional dependency. FFmpeg is also required; an absolute executable path can be supplied with `--ffmpeg` and is executed without shell interpolation. Alignment processes only missing sentences, in windows bounded by neighbouring valid source times, with a maximum 30-second terminal window.

```powershell
py -3.12 -m venv local/exam-align-venv
local/exam-align-venv/Scripts/python.exe -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
local/exam-align-venv/Scripts/python.exe -m pip install whisperx==3.8.6 --no-deps
local/exam-align-venv/Scripts/python.exe -m pip install numpy pandas transformers==4.57.6 nltk scipy soundfile
local/exam-align-venv/Scripts/python.exe -c "import nltk; nltk.download('punkt_tab')"
local/exam-align-venv/Scripts/python.exe scripts/align-exams.py --catalog local/exam-bank/catalog.json --assets local/exam-bank/assets --output local/exam-bank/catalog-aligned.json
```

WhisperX and PyTorch compatibility can vary by release and platform. The tested local alignment environment used Python 3.12.13, torch/torchaudio 2.8.0 CPU and WhisperX 3.8.6. Its alignment-only installation used WhisperX with `--no-deps` plus `numpy pandas transformers==4.57.6 nltk scipy soundfile`; it does not need the ASR, GPU or speaker-diarization stack for this script. If the packages cannot run locally, use reviewed JSON import instead. No fabricated timing is substituted. If word segmentation differs from the supplied transcript or a word has no reliable time/confidence, the tool leaves that sentence unresolved. WhisperX's default word interpolation is disabled. Review generated starts and ends by listening before accepting them for a source release.

The import format uses seconds and stable IDs:

```json
{
  "alignments": [
    { "sectionId": "source:1000", "sentenceId": "source:4998", "start": 43.2, "end": 47.9 }
  ]
}
```

The times above demonstrate the format only; they are not source timing for that sentence. A `sections[].sentences[]` catalog-shaped input is also accepted. If optional text is present, it must exactly match the source sentence.

```powershell
python scripts/align-exams.py --catalog local/exam-bank-aligned/catalog.json --assets local/exam-bank/assets --output local/exam-bank-aligned/catalog-reviewed.json --alignment local/exam-bank-aligned/reviewed-times.json --package-dir local/exam-bank-reviewed
```

Output must differ from the source, and an existing output is protected unless `--overwrite` is explicitly given. Valid source times are preserved unless explicitly listed with `--replace-sentence` and supported by reviewed JSON. WhisperX timings receive `alignment: "generated"`; reviewed imports receive `alignment: "corrected"`. Each correction carries its method, timestamp and source content hash. Re-audit the output, update matching section bundles through the content pipeline, and check sentence playback before seeding the corrected catalog. Keep unresolved timing visible in the app.

Use `--package-dir local/exam-bank-aligned` to write a separate aligned `catalog.json`, `metadata.json`, `sections/` and `audit.json`. The package reuses the original asset directory; it does not duplicate the 1.63 GB of media. Pass `--assets local/exam-bank/assets` when dry-running or seeding that package. Do not rerun the raw importer over generated alignment: the importer intentionally restores original source timing. The alignment audit sits beside the output as `catalog-aligned.alignment-audit.json` and includes source/output checksums, generated/corrected counts and unresolved records.

The final 26-interval review is a computational audio review, not a claim of manual listening approval. Source `source:54358` repeats a substring of the next narrator sentence and shares its audio interval. Source `source:3280` differs from the phrase returned consistently by two ASR windows; its original text remains authoritative and its interval covers the corresponding audible utterance. Source `source:89566` has a low-confidence trailing word; its interval covers the fragment without claiming an exact word boundary. Source ellipses and the confirmed duplicate narrator substring are retained. These limitations are recorded alongside the corrected rows and in the readiness audit.

The final package reuses `local/exam-bank/assets`; its deployment preflight is:

```powershell
node scripts/seed-exams.mjs --catalog local/exam-bank-final-v4/catalog.json --assets local/exam-bank/assets --audit local/exam-bank-final-v4/audit.json --dry-run --manifest local/exam-bank-final-v4/seed-manifest.json
```

For the October 12 release the preflight passed with 56 papers, 392 sections, 168 passages, 4,339 question groups, 4,480 answer slots and 248 assets (1,634,448,805 bytes). The parent applied the migration, uploaded all assets and verified signed media, per-account RLS and the earlier seed. The final v4 timing catalog was seeded successfully and verified.

The adjacent-interval audit checked 9,922 consecutive sentence pairs. The only flagged pair is the confirmed source:702 duplicate narrator substring. All other detected overlaps above one second and start reversals were corrected using audio diagnostics. The report is recorded in `docs/exam-readiness-audit.json` and `local/exam-bank-final-v4/adjacency-audit.json`.

Numerically valid source intervals can be replaced only with reviewed JSON and explicit IDs, e.g. `--replace-sentence source:77691`. The script rejects unknown IDs, missing reviewed rows, mismatched optional source text and out-of-duration replacement intervals. Other valid intervals remain unchanged; replacement provenance retains the previous timing and review evidence. The final review additionally corrected 15 explicitly identified adjacent intervals. Every replacement preserves the old timing and review evidence in provenance.

Release verification reported by the parent: 602 automated tests and production build passed; live per-account RLS, all catalog counts, 28 per-book samples, private media sizes and signed audio were verified. The final v4 seed completed and was verified; its immutable bytes have SHA-256 `8dd491d4e0770336e7b529218af562ccdc1b76e77923e659597a88ff8bc82da0`.
