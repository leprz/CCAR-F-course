#!/usr/bin/env python3
"""Lint a teach-me lecture against the book-chapter contract (see SKILL.md §4).

Usage: check-lecture.py <lecture.md> [<lecture.md> ...]

Checks structure only; it can't judge whether the prose teaches well. Prints
ERROR lines (contract broken) and WARN lines (likely a cheat-sheet relapse),
then a one-line stats summary per file. Exit 1 if any file has an ERROR.
"""
import re
import sys

REQUIRED_TAIL = ["Summary", "Traps and decision rules", "Going deeper"]
WORD_BANDS = {"brief": (800, 2000), "chapter": (1500, 9000), "deep": (4000, None)}


def strip_fences(lines):
    """Yield (lineno, line, in_fence, opens) so headings inside code blocks are ignored.

    A fence closes only on a bare run of the same character at least as long as the opener,
    so a ```lang block nested inside a ````markdown block stays inside it.
    """
    fence = None
    for i, line in enumerate(lines, 1):
        m = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if m and fence is None:
            fence = m.group(1)
            yield i, line, True, True
            continue
        if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence) and not m.group(2).strip():
            fence = None
            yield i, line, True, False
            continue
        yield i, line, fence is not None, False


def check(path):
    text = open(path, encoding="utf-8").read()
    lines = text.splitlines()
    errors, warns = [], []

    if not text.startswith("---\n"):
        errors.append("missing YAML front-matter")
    fm = dict(re.findall(r"^(\w+):\s*(.*)$", text.split("---", 2)[1], re.M)) if text.startswith("---") else {}
    for key in ("title", "topic", "date", "depth", "tags"):
        if key not in fm:
            errors.append(f"front-matter lacks `{key}`")
    depth = fm.get("depth", "chapter").strip()
    if depth not in WORD_BANDS:
        errors.append(f"depth `{depth}` is not one of {', '.join(WORD_BANDS)}")

    h2, bullets, prose_lines, untagged = [], 0, 0, []
    for i, line, in_fence, opens in strip_fences(lines):
        if in_fence:
            if opens and not re.match(r"^\s*(`{3,}|~{3,})\s*\S", line):
                untagged.append(i)
            continue
        if line.startswith("## "):
            h2.append((i, line[3:].strip()))
        elif re.match(r"^\s*([-*]|\d+\.)\s", line):
            bullets += 1
        elif line.strip() and not line.startswith(("#", "|", ">", "<")):
            prose_lines += 1

    names = [n for _, n in h2]
    if "The running example" not in names:
        errors.append("no `## The running example` section")
    for tail in REQUIRED_TAIL:
        if tail not in names:
            errors.append(f"no `## {tail}` section")
    numbered = [(i, n) for i, n in h2 if re.match(r"^\d+\.\s", n)]
    concept = [(i, n) for i, n in numbered if "Putting it together" not in n]
    if len(concept) < 2:
        errors.append(f"only {len(concept)} numbered concept section(s)")
    if not any("Putting it together" in n for _, n in numbered):
        warns.append("no numbered `Putting it together` section")

    # Each concept section needs a Check yourself with a collapsible answer.
    bounds = [i for i, _ in h2] + [len(lines) + 1]
    for i, name in concept:
        end = next(b for b in bounds if b > i)
        body = "\n".join(lines[i:end - 1])
        if "Check yourself" not in body:
            errors.append(f"section `{name}` (line {i}) has no Check yourself")
        elif "<details>" not in body:
            errors.append(f"section `{name}` (line {i}): Check yourself answer is not in <details>")
        if not re.search(r"what goes wrong|mistake|pitfall|broken|wrong", body, re.I):
            warns.append(f"section `{name}` (line {i}) shows no failure case")
        if "```" not in body and not re.search(r"^\|.*\|\s*$", body, re.M):
            warns.append(f"section `{name}` (line {i}) has no worked example (no code, payload or table)")

    # marked only parses markdown inside <details> after a blank line.
    for m in re.finditer(r"</summary>\n(?!>?\s*\n)", text):
        errors.append(f"line {text[:m.start()].count(chr(10)) + 1}: needs a blank line after </summary>")

    if re.search(r"<[A-Z_]{3,}[^>]*>", re.sub(r"```.*?```", "", text, flags=re.S)):
        errors.append("unfilled <PLACEHOLDER> left in the text")
    if "<!--" in text:
        errors.append("template HTML comment left in the text")
    for ln in untagged:
        warns.append(f"line {ln}: code fence without a language tag")

    words = len(re.sub(r"```.*?```", "", text, flags=re.S).split())
    lo, hi = WORD_BANDS.get(depth, (0, None))
    if words < lo:
        warns.append(f"{words} prose words is short for depth `{depth}` (>= {lo})")
    if hi and words > hi:
        warns.append(f"{words} prose words is long for depth `{depth}` (<= {hi})")
    ratio = bullets / max(prose_lines, 1)
    if ratio > 0.6:
        warns.append(f"bullet-heavy: {bullets} bullet lines vs {prose_lines} prose lines (cheat-sheet relapse?)")

    for e in errors:
        print(f"{path}: ERROR {e}")
    for w in warns:
        print(f"{path}: WARN  {w}")
    print(f"{path}: {'FAIL' if errors else 'OK'} — {words} prose words, {len(concept)} concept sections, "
          f"bullets/prose {bullets}/{prose_lines}")
    return not errors


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ok = all([check(p) for p in sys.argv[1:]])
    sys.exit(0 if ok else 1)
