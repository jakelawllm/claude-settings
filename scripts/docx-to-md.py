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


def check_docx_features(doc):
    """Warn (never fail) about content the converter is known to drop silently.

    Tracked changes, footnotes and text boxes can all carry legally
    significant text that `body_items`/`render_paragraph` never visit, so a
    clean run of this script is not proof the .md is a complete rendering of
    the .docx. This only prints warnings to stderr; it does not raise.
    """
    body = doc.element.body

    # 1. Tracked changes: <w:ins>/<w:del> wrap accepted/rejected edits that
    # python-docx's own paragraph iteration skips over entirely.
    revisions = body.xpath(".//w:ins | .//w:del")
    if revisions:
        print(
            f"WARNING: docx-to-md: tracked changes detected ({len(revisions)} "
            "insertion/deletion element(s)) - accepted and rejected edits are "
            "not distinguished, and their text may be silently included or "
            "dropped in the rendered Markdown",
            file=sys.stderr,
        )

    # 2. Footnotes: not exposed by python-docx's Document API at all, so they
    # have to be found via the footnotes part relationship directly.
    footnote_count = 0
    try:
        for rel in doc.part.rels.values():
            if rel.is_external or not rel.reltype.endswith("/footnotes"):
                continue
            footnotes = rel.target_part.element.xpath(
                ".//w:footnote["
                "not(@w:type='separator') and "
                "not(@w:type='continuationSeparator')"
                "]"
            )
            footnote_count += len(footnotes)
    except Exception:
        pass
    if footnote_count:
        print(
            f"WARNING: docx-to-md: {footnote_count} footnote(s) detected - "
            "footnote text is not rendered in the Markdown output",
            file=sys.stderr,
        )

    # 3. Text boxes: content inside <w:txbxContent> is not walked by
    # body_items, so it never reaches render_paragraph/render_table.
    if "txbxContent" in body.xml:
        print(
            "WARNING: docx-to-md: text box(es) detected - text box content "
            "is not rendered in the Markdown output",
            file=sys.stderr,
        )


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
    check_docx_features(document)

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
