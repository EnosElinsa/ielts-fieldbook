#!/usr/bin/env python3
"""Align supplied source transcripts on CPU, or import reviewed sentence timing JSON.

This tool fills unavailable timing and replaces valid timing only for explicitly
listed reviewed sentence IDs. It never transcribes, changes source text, or derives
an answer key. A new output is mandatory and existing files are protected.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unicodedata
import wave


def valid_timing(row: dict, duration: float | None = None) -> bool:
    start, end = row.get("start"), row.get("end")
    return (isinstance(start, (int, float)) and not isinstance(start, bool)
            and isinstance(end, (int, float)) and not isinstance(end, bool)
            and math.isfinite(start) and math.isfinite(end)
            and 0 <= start < end and (duration is None or end <= duration + 0.25))


def normalized_word(text: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFKC", text).lower()
                   if char.isalnum() or char in "'’")


def file_digest(filename: Path) -> str:
    digest = hashlib.sha256()
    with filename.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def asset_file(directory: Path, storage_path: str) -> Path:
    relative = Path(storage_path)
    if relative.is_absolute() or ".." in relative.parts or "\\" in storage_path:
        raise ValueError("Unsafe audio storagePath")
    candidate = (directory / relative).resolve(strict=True)
    candidate.relative_to(directory.resolve(strict=True))
    if not candidate.is_file() or candidate.stat().st_size == 0:
        raise ValueError("Missing or empty alignment audio")
    return candidate


def external_rows(filename: Path) -> dict[tuple[str, str], dict]:
    data = json.loads(filename.read_text(encoding="utf-8"))
    rows = data.get("alignments")
    if rows is None:
        rows = [{"sectionId": section["id"], "sentenceId": sentence["id"], **sentence}
                for section in data.get("sections", []) for sentence in section.get("sentences", [])]
    if not isinstance(rows, list):
        raise ValueError("Alignment JSON requires alignments[] or sections[].sentences[]")
    indexed = {}
    for row in rows:
        key = (row.get("sectionId"), row.get("sentenceId"))
        if not all(isinstance(value, str) and value for value in key) or key in indexed:
            raise ValueError("Alignment rows need unique sectionId and sentenceId")
        if not valid_timing(row):
            raise ValueError(f"Invalid imported timing for {key[0]}/{key[1]}")
        indexed[key] = row
    return indexed


def forced_align(section: dict, audio: Path, ffmpeg: str, aligner: tuple) -> dict[str, dict]:
    import whisperx  # Optional; imported only when CPU alignment is requested.

    model, metadata = aligner
    sentences = section.get("sentences", [])
    transcript = " ".join(sentence["text"] for sentence in sentences)
    if not transcript.strip():
        raise ValueError("Cannot align a missing source transcript")
    with tempfile.TemporaryDirectory(prefix="ielts-align-") as temporary:
        wav_file = Path(temporary) / "audio.wav"
        subprocess.run([ffmpeg, "-nostdin", "-v", "error", "-i", str(audio), "-ar", "16000",
                        "-ac", "1", "-c:a", "pcm_s16le", str(wav_file)], check=True,
                       capture_output=True, shell=False)
        with wave.open(str(wav_file), "rb") as stream:
            duration = stream.getnframes() / stream.getframerate()
        waveform = whisperx.load_audio(str(wav_file))
    rows = {}
    for index, sentence in enumerate(sentences):
        if valid_timing(sentence, duration):
            continue
        previous = next((row for row in reversed(sentences[:index]) if valid_timing(row, duration)), None)
        following = next((row for row in sentences[index + 1:] if valid_timing(row, duration)), None)
        known_start = sentence.get("start")
        usable_start = isinstance(known_start, (int, float)) and math.isfinite(known_start) and 0 <= known_start < duration
        start = max(0.0, (known_start if usable_start else previous["end"] if previous else 0.0) - 0.75)
        end = min(duration, following["start"] + 0.75 if following else start + 30.0)
        if end <= start:
            continue
        # Restrict CPU work to a source-neighbour window, avoiding full-section ASR.
        window = waveform[int(start * 16000):int(end * 16000)]
        aligned = whisperx.align([{"start": 0.0, "end": end - start, "text": sentence["text"]}],
                                  model, metadata, window, "cpu", interpolate_method="ignore", return_char_alignments=False)
        aligned_words = aligned.get("word_segments", [])
        expected_words = re.findall(r"\S+", sentence["text"])
        if len(aligned_words) != len(expected_words) or any(
                normalized_word(actual.get("word", "")) != normalized_word(expected)
                for actual, expected in zip(aligned_words, expected_words)):
            continue
        timed = [word for word in aligned_words if valid_timing(word, end - start)
                 and isinstance(word.get("score"), (int, float)) and word["score"] > 0]
        if len(timed) != len(expected_words) or not timed:
            continue
        row = {"start": start + timed[0]["start"], "end": start + timed[-1]["end"]}
        if valid_timing(row, duration):
            rows[sentence["id"]] = row
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--alignment", type=Path, help="Import reviewed JSON instead of running WhisperX")
    parser.add_argument("--replace-sentence", action="append", default=[],
                        help="Explicit sentence ID whose existing valid timing may be replaced; requires reviewed JSON")
    parser.add_argument("--section", action="append", help="Only align this section ID; repeatable")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="Executable name or absolute path")
    parser.add_argument("--language", default="en")
    parser.add_argument("--threads", type=int, default=4, help="CPU threads (default: 4)")
    parser.add_argument("--overwrite", action="store_true", help="Allow replacing an existing output file")
    parser.add_argument("--dry-run", action="store_true", help="Report missing timing without loading a model or writing")
    parser.add_argument("--package-dir", type=Path, help="Also write a separate aligned bank's catalog, metadata, section bundles and audit")
    args = parser.parse_args()
    if args.replace_sentence and not args.alignment:
        parser.error("--replace-sentence requires --alignment reviewed JSON")
    source = args.catalog.resolve(strict=True)
    output = args.output.resolve()
    if output == source:
        parser.error("Output must differ from source catalog")
    if output.exists() and not args.overwrite and not args.dry_run:
        parser.error("Output already exists; choose a new path or explicitly use --overwrite")
    if args.package_dir and args.package_dir.resolve() == source.parent:
        parser.error("Package directory must differ from the source bank directory")
    if args.package_dir and args.package_dir.exists() and not args.overwrite and not args.dry_run:
        parser.error("Package directory already exists; choose a new directory or explicitly use --overwrite")
    catalog = json.loads(source.read_text(encoding="utf-8"))
    if catalog.get("schemaVersion") != 1 or not isinstance(catalog.get("sections"), list):
        parser.error("Unsupported catalog format")
    result = copy.deepcopy(catalog)
    assets = {asset["id"]: asset for asset in catalog.get("assets", [])}
    targets = [section for section in result["sections"] if section.get("skill") == "listening"
               and (not args.section or section["id"] in args.section)]
    missing = [(section, sentence) for section in targets for sentence in section.get("sentences", [])
               if not valid_timing(sentence, assets.get(section.get("assetId"), {}).get("duration"))]
    replacements = set(args.replace_sentence)
    selected_ids = {sentence["id"] for section in targets for sentence in section.get("sentences", [])}
    if replacements - selected_ids:
        parser.error("Replacement sentence IDs must exist in the selected listening sections")
    summary = {"listeningSections": len(targets), "sentencesMissingTiming": len(missing),
               "updated": 0, "replacedExisting": 0, "unresolved": [], "method": "reviewed-json" if args.alignment else "whisperx-cpu"}
    if args.dry_run:
        print(json.dumps(summary, indent=2))
        return
    imported = external_rows(args.alignment.resolve(strict=True)) if args.alignment else None
    if replacements and not all((section["id"], sentence["id"]) in imported
                               for section in targets for sentence in section.get("sentences", [])
                               if sentence["id"] in replacements):
        parser.error("Every replacement ID requires a reviewed alignment row")
    for section in targets:
        for sentence in section.get("sentences", []):
            if sentence["id"] not in replacements:
                continue
            row = imported[(section["id"], sentence["id"])]
            if not valid_timing(row, assets.get(section.get("assetId"), {}).get("duration")):
                parser.error("Replacement timing exceeds the measured audio duration")
            if "text" in row and row["text"] != sentence["text"]:
                parser.error("Replacement timing text differs from the source transcript")
    aligner = None
    ffmpeg = shutil.which(args.ffmpeg)
    if missing and imported is None:
        if not ffmpeg:
            parser.error("ffmpeg is required; provide its absolute executable path with --ffmpeg")
        try:
            import whisperx
            import torch
        except ImportError:
            parser.error("Install optional WhisperX in a Python 3.12 environment, or use --alignment JSON")
        torch.set_num_threads(max(1, args.threads))
        aligner = whisperx.load_align_model(language_code=args.language, device="cpu")
    timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
    for section in targets:
        pending = [sentence for sentence in section.get("sentences", [])
                   if sentence["id"] in replacements or not valid_timing(sentence, assets.get(section.get("assetId"), {}).get("duration"))]
        if not pending:
            continue
        asset = assets.get(section.get("assetId"))
        if not asset:
            summary["unresolved"].append({"sectionId": section["id"], "reason": "Missing audio asset"})
            continue
        try:
            if imported is None:
                audio = asset_file(args.assets, asset["storagePath"])
                generated = forced_align(section, audio, ffmpeg, aligner)
            else:
                generated = {sentence["id"]: imported.get((section["id"], sentence["id"])) for sentence in pending}
            for sentence in pending:
                row = generated.get(sentence["id"])
                if not row or not valid_timing(row, asset.get("duration")):
                    summary["unresolved"].append({"sectionId": section["id"], "sentenceId": sentence["id"], "reason": "No reliable alignment"})
                    continue
                if "text" in row and row["text"] != sentence["text"]:
                    raise ValueError("Imported timing text differs from the source transcript")
                previous_timing = {key: sentence.get(key) for key in ("start", "end", "alignment")}
                replacing = sentence["id"] in replacements and valid_timing(sentence, asset.get("duration"))
                sentence.update(start=float(row["start"]), end=float(row["end"]),
                                alignment="corrected" if imported is not None else "generated")
                sentence["alignmentProvenance"] = {"method": summary["method"], "createdAt": timestamp,
                    "sourceContentHash": section.get("provenance", {}).get("contentHash"),
                    **({"alignmentSha256": file_digest(args.alignment)} if imported is not None else {}),
                    **({"previousTiming": previous_timing, "explicitReplacement": True,
                        "reviewEvidence": row.get("evidence"), "reviewLimitations": row.get("limitations")}
                       if replacing else {})}
                summary["updated"] += 1
                summary["replacedExisting"] += int(replacing)
            print(f'Aligned {section["id"]}: {summary["updated"]} updates, {len(summary["unresolved"])} unresolved so far', flush=True)
        except (ValueError, FileNotFoundError, subprocess.CalledProcessError) as error:
            summary["unresolved"].append({"sectionId": section["id"], "reason": str(error) if not isinstance(error, subprocess.CalledProcessError) else "ffmpeg decoding failed"})
    sentence_lookup = {sentence["id"]: sentence for section in result["sections"] for sentence in section.get("sentences", [])}
    for question in result.get("questions", []):
        evidence = question.get("evidence")
        sentence = sentence_lookup.get((evidence or {}).get("sentenceId"))
        if evidence and sentence and valid_timing(sentence):
            evidence.update(start=sentence["start"], end=sentence["end"])
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects output even if another process creates it during alignment.
    with output.open("w" if args.overwrite else "x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, allow_nan=False)
    summary["sourceSha256"] = file_digest(source)
    summary["outputSha256"] = file_digest(output)
    summary["generatedSentences"] = sum(sentence.get("alignment") == "generated" for section in result["sections"] for sentence in section.get("sentences", []))
    summary["correctedSentences"] = sum(sentence.get("alignment") == "corrected" for section in result["sections"] for sentence in section.get("sentences", []))
    report = output.with_suffix(".alignment-audit.json")
    with report.open("w" if args.overwrite else "x", encoding="utf-8") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2)
    if args.package_dir:
        package = args.package_dir.resolve()
        (package / "sections").mkdir(parents=True, exist_ok=True)
        (package / "catalog.json").write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        metadata = {**result, "sections": [{**section, "sentences": []} for section in result["sections"]],
                    "questions": [], "passages": [], "assets": []}
        (package / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        for section in result["sections"]:
            section_id = section["id"]
            safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", section_id)
            bundle = {"schemaVersion": 1, "sections": [section],
                      "papers": [paper for paper in result["papers"] if paper["id"] == section["paperId"]],
                      **{key: [row for row in result[key] if row.get("sectionId") == section_id]
                         for key in ["passages", "questions", "assets"]}}
            (package / "sections" / f"{safe_name}.json").write_text(json.dumps(bundle, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        warnings = [f'Missing/invalid timestamps {section["id"]}/{sentence["id"]}'
                    for section in result["sections"] for sentence in section.get("sentences", [])
                    if not valid_timing(sentence, assets.get(section.get("assetId"), {}).get("duration"))]
        audit = {"papers": len(result["papers"]), "listeningSections": sum(section.get("skill") == "listening" for section in result["sections"]),
                 "readingSections": sum(section.get("skill") == "reading" for section in result["sections"]),
                 "questions": len(result["questions"]), "answerSlots": sum(question.get("points", 1) for question in result["questions"]),
                 "sentences": sum(len(section.get("sentences", [])) for section in result["sections"]),
                 "assets": len(result["assets"]), "failures": [], "errors": [], "warnings": warnings,
                 "alignment": summary, "missingExplanations": sum(not question.get("explanation") for question in result["questions"])}
        node = shutil.which("node")
        if not node:
            raise ValueError("Node.js is required to validate packaged catalogs")
        validator = (Path(__file__).resolve().parent / "lib" / "exam-import.mjs").as_uri()
        validation_code = "import fs from 'node:fs'; const {validateCatalog}=await import(process.argv[1]); console.log(JSON.stringify(validateCatalog(JSON.parse(fs.readFileSync(process.argv[2],'utf8')))));"
        validation = subprocess.run([node, "--input-type=module", "-e", validation_code, validator,
                                     str(package / "catalog.json")], check=True, capture_output=True, text=True, shell=False)
        audit.update(json.loads(validation.stdout))
        (package / "audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
        summary["packageDirectory"] = str(package)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
