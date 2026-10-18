#!/usr/bin/env python3
"""build-library.py <root>

Rebuild <root>/library.json from every <root>/lectures/*/lecture.md (§5b of
SKILL.md). Reads each lecture's YAML front-matter and, if present, its
questions.json for the question count and the union of its question
objective IDs. Sorting is left to the client.

No third-party deps: the front-matter parser handles the small, known shape the
template emits (title/topic/date/depth/tags) without PyYAML.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


DATE_PREFIX = re.compile(r"^([0-9]{4}-[0-9]{2}-[0-9]{2})-")


def parse_front_matter(text):
    """Return the YAML front-matter block (between the first two '---') as a dict."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    out, i = {}, 1
    while i < len(lines) and lines[i].strip() != "---":
        line = lines[i]
        i += 1
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if not key:
            continue
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            out[key] = [t.strip().strip("'\"") for t in inner.split(",") if t.strip()] if inner else []
        else:
            out[key] = val.strip("'\"")
    return out


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: build-library.py <root>")
    root = Path(sys.argv[1])

    entries = []
    for md in sorted(root.glob("lectures/*/lecture.md")):
        slug = md.parent.name
        fm = parse_front_matter(md.read_text(encoding="utf-8"))

        question_count = 0
        objectives = set()
        qjson = md.parent / "questions.json"
        if qjson.exists():
            try:
                questions = json.loads(qjson.read_text(encoding="utf-8")).get("questions", [])
                question_count = len(questions)
                for q in questions:
                    objectives.update(o for o in (q.get("objectives") or []) if isinstance(o, str))
            except (ValueError, OSError, AttributeError):
                question_count = 0

        # Slugs may or may not carry a date prefix (<YYYY-MM-DD>-topic or
        # <NN>-topic). Fall back to the slug's date only when it has one.
        date = fm.get("date", "")
        if not date:
            m = DATE_PREFIX.match(slug)
            date = m.group(1) if m else ""

        entries.append({
            "slug": slug,
            "title": fm.get("title", slug),
            "topic": fm.get("topic", ""),
            "date": date,
            "depth": fm.get("depth", "chapter"),
            "questionCount": question_count,
            "tags": fm.get("tags", []),
            "objectives": sorted(objectives),
            "notesPath": f"lectures/{slug}/lecture.md",
            "quizUrl": f"quiz.html?lecture={slug}",
        })

    library = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lectures": entries,
    }
    (root / "library.json").write_text(json.dumps(library, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"library.json: {len(entries)} lecture(s)")


if __name__ == "__main__":
    main()
