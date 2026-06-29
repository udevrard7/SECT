#!/usr/bin/env python3
"""PROG-ACAD-CRITICAL-FIX-1 — Brace balance check.

For each Go file modified, strip strings (interpreted and raw), runes, and
comments (line and block), then count opening and closing braces, parens,
and brackets. They must balance (delta = 0).
"""
import re
import sys

FILES = [
    "/home/z/SECT/backend/internal/transport/http/academique_handlers.go",
    "/home/z/SECT/backend/internal/transport/http/affectation_handlers.go",
]


def strip_go_artifacts(src: str) -> str:
    # 1. Block comments /* ... */ (non-greedy, multiline).
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    # 2. Line comments // ... (up to end of line).
    src = re.sub(r"//[^\n]*", "", src)
    # 3. Raw strings `...` (backticks). Non-greedy.
    src = re.sub(r"`[^`]*`", "", src)
    # 4. Interpreted strings "..." with escape handling.
    # We do a manual scan to handle escaped quotes \" properly.
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c == '"':
            # Skip until closing unescaped quote.
            i += 1
            while i < n:
                if src[i] == '\\' and i + 1 < n:
                    i += 2
                    continue
                if src[i] == '"':
                    i += 1
                    break
                i += 1
            out.append('""')  # placeholder (balanced)
            continue
        if c == '\'':
            # Rune literal: '...' (may contain escaped char).
            i += 1
            while i < n:
                if src[i] == '\\' and i + 1 < n:
                    i += 2
                    continue
                if src[i] == '\'':
                    i += 1
                    break
                i += 1
            out.append("''")
            continue
        out.append(c)
        i += 1
    return "".join(out)


for path in FILES:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    stripped = strip_go_artifacts(src)
    braces = stripped.count("{") - stripped.count("}")
    parens = stripped.count("(") - stripped.count(")")
    brackets = stripped.count("[") - stripped.count("]")
    status = "OK" if (braces == 0 and parens == 0 and brackets == 0) else "FAIL"
    print(f"{status}  {path}")
    print(f"      braces={braces:+d}  parens={parens:+d}  brackets={brackets:+d}")
    if status == "FAIL":
        sys.exit(1)

print("\nAll files OK (braces, parens, brackets balanced).")
