"""Audit the released public group curriculum without reading accounts or source texts.

python scripts/audit-vocabulary-curriculum.py [--check]
Sentence heuristics produce repair candidates, not exhaustive linguistic judgments.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("readiness_audit", ROOT / "scripts/audit-vocabulary-readiness.py")
READINESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READINESS)
OUTPUT_JSON = ROOT / "docs/vocabulary-curriculum-audit.json"
OUTPUT_MD = ROOT / "docs/vocabulary-curriculum-audit.md"
RELATION = re.compile(r"^(?:near[- ]?synonyms?|synonyms?|antonyms?|holonyms?|hypernyms?|hyponyms?|meronyms?|coordinate terms?|for quotations|see (?:also )?(?:citations|thesaurus))\s*[:.]?", re.I)
PLACEHOLDER = re.compile(r"definition pending|meaning pending|a phrase referring to|the word is|^senses (?:relating|referring)|\b(?:particularly|such as)\s*:?$|^(?:alternative|standard|british|american|commonwealth|non-oxford|uk).{0,90}\b(?:spelling|form) of\b", re.I)
FORM_ONLY = re.compile(r"^(?:simple past|past participle|present participle|plural|comparative|superlative)\b", re.I)


def content_candidates(sense):
    result = []
    definition = sense.get("definition", "").strip()
    example = sense.get("example", "").strip()
    if not definition or PLACEHOLDER.search(definition) or FORM_ONLY.search(definition):
        result.append("placeholder-or-cross-reference-definition")
    if not example or RELATION.search(example):
        result.append("missing-or-pseudo-relation-example")
    elif not re.search(r"[.!?](?:[\"'’”]|\s|$)", example) or len(example.split()) < 4:
        result.append("sentence-example-candidate")
    return result


def audit():
    readiness = READINESS.audit()
    catalog = READINESS.read("public/vocabulary-catalog.json")
    memberships = readiness["memberships"]
    entry_ids = {e["id"] for e in catalog["entries"]}
    membership_keys = {READINESS.member_key(m) for m in catalog["memberships"]}
    structural = list(readiness["defects"])
    overlay_candidates = []
    overlay_counts = {}
    for path in sorted(readiness["summary"]["curriculumRowsByFile"]):
        rows = READINESS.read(path)
        overlay_counts[path] = len(rows)
        global_sense_rows = "Common" in path or "Repairs" in path or "ModernDefaults" in path
        key_fn = (lambda r: (r["entryId"], r["sense"]["id"])) if global_sense_rows else READINESS.member_key
        for key, count in Counter(key_fn(r) for r in rows).items():
            if count > 1:
                structural.append({"type": "duplicate-curriculum-binding", "file": path, "identity": key, "count": count})
        for row in rows:
            sense = row.get("sense", {})
            context = {"file": path, "bookId": row.get("bookId"), "unitId": row.get("unitId"), "entryId": row["entryId"], "term": row.get("term"), "senseId": sense.get("id")}
            if row["entryId"] not in entry_ids or (not global_sense_rows and READINESS.member_key(row) not in membership_keys):
                structural.append({**context, "type": "invalid-curriculum-membership"})
            for field in ("id", "definition", "example", "pos", "source", "license", "attribution"):
                if not READINESS.present(sense.get(field)):
                    structural.append({**context, "type": "missing-curriculum-field", "field": field})
            if len(sense.get("collocations", [])) < 2:
                structural.append({**context, "type": "insufficient-collocations"})
            for issue in content_candidates(sense):
                overlay_candidates.append({**context, "type": issue, "definition": sense.get("definition"), "example": sense.get("example")})
    content = []
    for row in memberships:
        for issue in content_candidates(row):
            content.append({"type": issue, **{k: row[k] for k in ("bookId", "unitId", "entryId", "term", "senseId", "curriculumBasis", "selectionSource", "definition", "example")}})
    groups = []
    for group in readiness["groups"]:
        ms = [m for m in memberships if m["bookId"] == group["bookId"] and m["unitId"] == group["unitId"]]
        defects = [d for d in content if d["bookId"] == group["bookId"] and d["unitId"] == group["unitId"]]
        groups.append({**{k: group[k] for k in ("bookId", "unitId", "title", "declaredWords", "memberships", "uniqueEntryIds", "passed")},
                       "curriculumBasisCounts": dict(sorted(Counter(m["curriculumBasis"] for m in ms).items())),
                       "coveredMemberships": sum(bool(m["curriculumBasis"] and not m["missingDefinition"] and not m["missingExample"] and not m["missingPos"]) for m in ms),
                       "authoredSelectionMemberships": sum(m["curriculumAuthored"] for m in ms),
                       "sourceMeaningVerifiedMemberships": sum(m["sourceMeaningVerified"] for m in ms),
                       "contentRepairCandidates": len(defects),
                       "selections": [{k: m[k] for k in ("membershipId", "entryId", "term", "senseId", "curriculumSenseIds", "curriculumBasis", "selectionSource", "sourceMeaningVerified")} for m in ms]})
    summary = {"entries": len(readiness["entries"]), "memberships": len(memberships), "groups": len(groups),
               "coveredMemberships": sum(g["coveredMemberships"] for g in groups),
               "groupsWithFullCoverage": sum(g["coveredMemberships"] == g["memberships"] for g in groups),
               "membershipBasisCounts": dict(sorted(Counter(m["curriculumBasis"] for m in memberships).items())),
               "authoredRowsByFile": overlay_counts, "structuralDefects": len(structural),
               "selectedContentRepairCandidates": len(content), "selectedUniqueRepairIdentities": len({(d["entryId"], d["senseId"], d["type"]) for d in content}),
               "authoredContentRepairCandidates": len(overlay_candidates),
               "repairCandidateTypes": dict(sorted(Counter(d["type"] for d in content).items()))}
    return {"schemaVersion": 1, "scope": "Automatic public fresh-state curriculum coverage, identity, and structural content candidates. No accounts or original private source texts are read.",
            "privateDataRead": False, "humanSemanticAudit": False,
            "basisDefinitions": {"theme": "Teaching recommendation based on the named thematic chapter; not original-source verification.", "common": "A common modern learning meaning for a general list; not original-source verification.", "multiple": "Separate common meanings in the polysemy syllabus; each retains its own sense identity.", "source": "Selection backed by a released source-context row; examples remain editorial learning examples."},
            "limitations": "Independent Python model, not browser execution. Sentence and placeholder patterns are conservative repair candidates and cannot prove grammar or semantic correctness. Topic overlay counts count authored corrections, not all reviewed/verified source meanings.",
            "sourceHashes": readiness["sourceHashes"], "summary": summary, "groups": groups,
            "structuralDefects": structural, "contentRepairCandidates": content, "authoredContentRepairCandidates": overlay_candidates}


def markdown(report):
    s = report["summary"]
    lines = ["# Vocabulary curriculum audit", "", "Generated from public release content by `python scripts/audit-vocabulary-curriculum.py`. No accounts or private source text are read.", "",
             f"All **{s['memberships']:,} memberships in {s['groups']} groups** have a named curriculum basis; **{s['coveredMemberships']:,} memberships / {s['groupsWithFullCoverage']} groups** have a nonempty selected definition, example and part of speech.", "",
             "This measures fresh public content, not browser execution or exhaustive linguistic review. Thematic and common curricula are teaching recommendations. Only source-context rows provide released source evidence; editorial examples do not become quotations.", "",
             "| Basis | Memberships | Meaning |", "|---|---:|---|"]
    for basis, count in s["membershipBasisCounts"].items():
        lines.append(f"| {basis} | {count:,} | {report['basisDefinitions'].get(basis, 'Unknown')} |")
    lines += ["", "| Authored file | Rows |", "|---|---:|"]
    for path, count in s["authoredRowsByFile"].items():
        lines.append(f"| {path} | {count:,} |")
    lines += ["", f"Structural defects: **{s['structuralDefects']}**. Selected-content repair candidates: **{s['selectedContentRepairCandidates']} membership occurrences / {s['selectedUniqueRepairIdentities']} unique entry/sense/type identities**. Authored-row repair candidates: **{s['authoredContentRepairCandidates']}**.", "",
              "Sentence heuristics flag fragments, pseudo dictionary relations and cross-reference definitions for inspection. These candidates are not a definitive linguistic defect count. Exact group membership selections, source hashes and complete candidates are in the JSON.", "",
              "| Book / group | Memberships | Covered | Basis | Repair candidates |", "|---|---:|---:|---|---:|"]
    for g in report["groups"]:
        lines.append(f"| {g['bookId']} / {g['unitId']} | {g['memberships']} | {g['coveredMemberships']} | {', '.join(g['curriculumBasisCounts'])} | {g['contentRepairCandidates']} |")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    report = audit()
    output = [(OUTPUT_JSON, json.dumps(report, indent=2, ensure_ascii=False) + "\n"), (OUTPUT_MD, markdown(report))]
    if args.check:
        if any(not path.exists() or path.read_text(encoding="utf-8") != text for path, text in output):
            print("Curriculum reports missing or stale; rerun without --check.")
            return 1
    else:
        for path, text in output:
            path.write_text(text, encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return int(bool(report["structuralDefects"]))


if __name__ == "__main__":
    raise SystemExit(main())
