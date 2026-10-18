#!/usr/bin/env python3
"""validate-quiz.py <questions.json>

Validate a generated quiz against $SKILL/questions.schema.json (§5 of SKILL.md).
Uses jsonschema when available; otherwise falls back to a structural check
(required keys per type, exactly 4 options for multiple-choice, indices in range,
slug shape, optional objective IDs).

Exit 0 + "OK" on success; exit 1 + the reason on failure.
"""
import json
import re
import sys
from pathlib import Path

SCHEMA = Path(__file__).resolve().parent.parent / "questions.schema.json"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
OBJECTIVE_RE = re.compile(r"^O[0-9]{2}$")


def structural_check(data):
    errors = []
    for key in ("lectureSlug", "title", "generatedAt", "questions"):
        if key not in data:
            errors.append(f"missing top-level key: {key}")
    slug = data.get("lectureSlug")
    if "lectureSlug" in data and (not isinstance(slug, str) or not SLUG_RE.match(slug)):
        errors.append(f"bad lectureSlug {slug!r} (lowercase, hyphenated)")
    questions = data.get("questions", [])
    if not isinstance(questions, list) or not questions:
        errors.append("questions must be a non-empty array")
        return errors
    for i, q in enumerate(questions):
        where = f"questions[{i}]"
        for key in ("id", "type", "prompt", "difficulty", "explanation"):
            if key not in q:
                errors.append(f"{where}: missing {key}")
        if q.get("difficulty") not in ("recall", "apply", "analyze"):
            errors.append(f"{where}: bad difficulty {q.get('difficulty')!r}")
        if "objectives" in q:
            objs = q["objectives"]
            if not isinstance(objs, list) or not objs:
                errors.append(f"{where}: objectives must be a non-empty array")
            else:
                if len(set(map(str, objs))) != len(objs):
                    errors.append(f"{where}: objectives must be unique")
                for o in objs:
                    if not isinstance(o, str) or not OBJECTIVE_RE.match(o):
                        errors.append(f"{where}: bad objective id {o!r} (expected O00-O99)")
        qtype = q.get("type")
        if qtype == "multiple-choice":
            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) != 4:
                errors.append(f"{where}: multiple-choice needs exactly 4 options")
            ci = q.get("correctIndex")
            if not isinstance(ci, int) or not (0 <= ci <= 3):
                errors.append(f"{where}: correctIndex must be 0-3")
        elif qtype == "true-false":
            if not isinstance(q.get("correct"), bool):
                errors.append(f"{where}: true-false needs boolean 'correct'")
        else:
            errors.append(f"{where}: unknown type {qtype!r}")
    return errors


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: validate-quiz.py <questions.json>")
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))

    try:
        import jsonschema
    except ImportError:
        errors = structural_check(data)
        if errors:
            print("INVALID (structural fallback):\n  " + "\n  ".join(errors))
            sys.exit(1)
        print("OK (structural fallback; jsonschema not installed)")
        return

    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    try:
        jsonschema.validate(data, schema)
    except jsonschema.ValidationError as e:
        loc = "/".join(str(p) for p in e.absolute_path) or "(root)"
        print(f"INVALID at {loc}: {e.message}")
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
