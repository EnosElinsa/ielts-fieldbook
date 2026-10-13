# Exam bank readiness audit

Audited 12 October 2026 from the final reviewed catalog and its signed-in source export. See [exam-readiness-audit.json](../local/audits/exam-readiness-audit.json) for machine-readable counts, hashes and one listening/reading structural sample per Cambridge book 8–21.

| Measure | Result |
| --- | ---: |
| Papers | 56 |
| Listening sections | 224 |
| Reading sections | 168 |
| Question groups | 4,339 |
| Answer slots | 4,480 |
| Transcript sentences | 10,146 |
| Mirrored assets | 248 |
| Generated timings | 120 |
| Corrected timings | 26 |
| Unresolved timings | 0 |
| Original source rationales preserved | 4,330 |
| Missing original source rationales | 9 |
| Missing English explanations | 7 |
| Source word-limit conflicts | 2 |

The catalog has zero structural validation errors. Deterministic samples for all 14 books (one listening and one reading section per book) matched raw answer values, alternatives, points, question IDs and, for listening, the source audio URL and mirrored asset mapping. This is a structural check; it does not replace manually listening through generated timing.

The 120 remaining generated timings were produced by CPU WhisperX in bounded windows using the existing source transcript. Twenty-six intervals, including the original eleven gaps and fifteen adjacent source boundary corrections, were computationally reviewed against independent ASR diagnostics, bounded source forced alignment and neighbouring transcript, then imported as corrected timing. No missing/invalid interval remains; this does not claim manual listening approval. Seven question groups have no English explanation; nine lack a full original source rationale. The optional `sourceExplanation` field preserves 4,330 original-language rationales separately from English evidence and paraphrase summaries. Two source answer keys conflict with their declared word limits; the original key is retained and the conflict remains a warning for product review. The user's statement that the source export is authorized for internal use is retained in provenance and is not an independently verified open-content license.

The current preserved-explanation catalog hash is `8dd491d4e0770336e7b529218af562ccdc1b76e77923e659597a88ff8bc82da0`, and its current unaligned source hash is `fc0d401d18d330cb952985634ad7769b2fce0f738ee2517b61423cebb4d84772`. The JSON report separately retains the original alignment-input and initial alignment-output hashes. Explanation preservation and twenty-six timing corrections changed packaged bytes after the initial alignment. Verification confirmed that all original text and answers and 120 remaining generated intervals are unchanged; the 11 original invalid intervals and 15 explicitly reviewed overlapping, overlong or reversed intervals changed; one initially generated interval received reviewed correction. All 10,146 sentence intervals fit within measured audio duration. The final package has 392 matching section bundles and a passing seed dry-run manifest at `local/exam-bank-final-v4/seed-manifest.json`. The reviewed JSON SHA-256 is `a9f5eb9149c383fafeaa88c6e090271f75564499ca38b0c6bf46db428d82e7da`.

The parent deployment task confirmed migration application, RLS isolation, all 248 private assets, signed audio and the earlier catalog seed. The final v4 reviewed catalog was seeded successfully using digest-verified unchanged media.

Review limitations: a duplicated narrator substring shares the next sentence’s audio; source/ASR phrasing differs for `source:3280`; the trailing word in `source:89566` has low confidence; the intentional duplicate narrator interval overlaps. Original source content is preserved, and these limitations remain explicit in the JSON report. The final package is `local/exam-bank-final-v4/`, reusing `local/exam-bank/assets`.

The adjacent-interval audit checked 9,922 consecutive sentence pairs. The sole flagged pair is source:702/source:54358 followed by source:54359: a confirmed duplicate narrator substring sharing the full sentence’s audio. No unexplained overlap above one second or start reversal remains. This audit does not claim that every retained source boundary was independently listened to.

The parent release task reported 602 passing automated tests and a passing production build, live RLS isolation checks, verified database counts (56 papers, 392 sections, 168 passages, 4,339 questions, 248 assets), 28 per-book samples and checks of private asset sizes and signed audio. The final v4 seed completed and its database content was verified.
