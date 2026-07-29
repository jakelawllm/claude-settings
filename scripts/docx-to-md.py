"""Render the policy .docx to Markdown.

The .docx is the authoritative document. This produces the diffable copy that
GitHub renders, so the two must be regenerated together.

    python scripts/docx-to-md.py <input.docx> <output.md>

Requires python-docx.
"""
import re
import sys

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

CLAUSE = re.compile(r"^(\d+\.\d+)\t(.*)$", re.S)
SUBCLAUSE = re.compile(r"^(\([a-z]+\))\t(.*)$", re.S)


def style_of(p):
    try:
        return p.style.name if p.style is not None else ""
    except Exception:
        return ""


def body_items(document):
    """Yield paragraphs and tables in document order."""
    parent = document.element.body
    for child in parent.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, document)
        elif child.tag.endswith("}tbl"):
            yield Table(child, document)


def cell_text(cell):
    parts = [p.text.strip() for p in cell.paragraphs if p.text.strip()]
    return "<br>".join(parts).replace("|", "\\|")


def render_table(table):
    rows = [[cell_text(c) for c in row.cells] for row in table.rows]
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    head, body = rows[0], rows[1:]
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * width]
    out += ["| " + " | ".join(r) + " |" for r in body]
    return out + [""]


def render_paragraph(p):
    text = p.text
    if not text.strip():
        return []
    style = style_of(p)
    if style == "Heading 1":
        return ["## " + text.strip(), ""]
    if style == "Heading 2":
        return ["### " + text.strip(), ""]

    m = CLAUSE.match(text)
    if m:
        return [f"**{m.group(1)}**  {m.group(2).strip()}", ""]
    m = SUBCLAUSE.match(text)
    if m:
        return [f"- **{m.group(1)}** {m.group(2).strip()}"]

    return [text.replace("\t", " ").strip(), ""]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    document = docx.Document(src)

    lines = [
        "<!-- Generated from the .docx by scripts/docx-to-md.py. Do not edit by hand. -->",
        "<!-- The .docx is the authoritative document; this is a rendering of it. -->",
        "",
    ]
    for item in body_items(document):
        if isinstance(item, Table):
            lines += render_table(item)
        else:
            lines += render_paragraph(item)

    # Collapse runs of blank lines left by empty paragraphs, and close a list
    # before non-list text so the next line isn't swallowed as a continuation.
    out, blank = [], False
    for line in lines:
        if line == "":
            if blank:
                continue
            blank = True
        else:
            if out and out[-1].startswith("- ") and not line.startswith("- "):
                out.append("")
            blank = False
        out.append(line)

    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out).strip() + "\n")

    print(f"wrote {dst}")


if __name__ == "__main__":
    main()
