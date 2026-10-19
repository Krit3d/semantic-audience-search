"""Regenerate legal HTML pages from source PDFs with proper table reconstruction.

Tables are detected only when at least 5 distinct column anchors repeat across
3+ lines (the tariff grid layout). Everything else renders as paragraphs/lists.

Run: python scripts/regen_legal_pages.py
"""

import html
import os
import re
from statistics import median

from pypdf import PdfReader

FILES = {
    "privacy": ("docs/документы_Google_Docs_политика_обработки_ПДн_4.pdf", "Политика обработки персональных данных"),
    "offer": ("docs/документы - публичная оферта.pdf", "Публичная оферта"),
    "aup": ("docs/документы_Политика_использования_сервиса_AUP_5.pdf", "Политика использования сервиса (AUP)"),
    "cookie": ("docs/документы_уведомление_об_использовании_cookie_4.pdf", "Уведомление об использовании файлов cookie"),
    "consent-pdn": ("docs/документы_согласие_на_обработку_ПДн_4.pdf", "Согласие на обработку персональных данных"),
    "consent-ads": ("docs/документы_согласие_на_рекл_рассылку_4.pdf", "Согласие на получение рекламных и информационных рассылок"),
}

TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Collabrama</title>
<style>
body {{ font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; background: #f8fafc; color: #1f2937; }}
.page {{ max-width: 860px; margin: 0 auto; padding: 40px 20px 64px; }}
h1 {{ font-size: 24px; margin-bottom: 4px; }}
h2 {{ font-size: 17px; margin-top: 32px; }}
p, li {{ font-size: 14.5px; line-height: 1.65; }}
ul {{ padding-left: 22px; }}
.meta {{ color: #6b7280; font-size: 13px; margin-bottom: 24px; }}
a {{ color: #4f46e5; }}
.back {{ display: inline-block; margin-bottom: 24px; font-size: 13.5px; text-decoration: none; }}
table {{ border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 13.5px; }}
th, td {{ border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }}
th {{ background: #eef2ff; font-weight: 700; }}
td:first-child {{ font-weight: 600; }}
</style>
</head>
<body><div class="page">
<a class="back" href="/">← На главную</a>
{body}
</div></body>
</html>
"""

PLACEHOLDERS = {
    "[НАЗВАНИЕ ПЛАТФОРМЫ]": "Collabrama",
    "[URL]": "https://collabrama.ru",
    "[Пользовательского соглашения]": "Политики использования сервиса",
    "[24 часа]": "24 часа",
}


def extract_lines(reader):
    plain_lines: list[str] = []
    raw_pages: list[list[tuple[float, float, str]]] = []
    for page in reader.pages:
        plain_lines.extend(
            ln.strip() for ln in (page.extract_text() or "").split("\n") if ln.strip()
        )
        words: list[tuple[float, float, str]] = []
        page.extract_text(
            visitor_text=lambda t, cm, tm, fd, fs: words.append((tm[5], tm[4], t)) if t.strip() else None
        )
        raw_pages.append(words)

    def build(desc: bool) -> list[tuple[list[tuple[float, str]], str]]:
        lines: list[tuple[list[tuple[float, str]], str]] = []
        for words in raw_pages:
            rows: dict[float, list[tuple[float, str]]] = {}
            for y, x, t in words:
                key = None
                for k in rows:
                    if abs(k - y) < 3:
                        key = k
                        break
                rows.setdefault(key if key is not None else y, []).append((x, t.strip()))
            for y in sorted(rows, reverse=desc):
                cells = sorted(rows[y])
                merged = " ".join(t for _, t in cells).strip()
                if merged:
                    lines.append((cells, merged))
        return lines

    desc_lines = build(True)
    probe = plain_lines[:10]
    idxs: list[int] = []
    texts = [m for _, m in desc_lines]
    for want in probe:
        for j, have in enumerate(texts):
            if want in have or have in want:
                idxs.append(j)
                break
    if len(idxs) >= 3 and idxs == sorted(idxs) and len(set(idxs)) == len(idxs):
        return desc_lines
    return build(False)


def detect_columns(lines):
    xs: list[float] = []
    for cells, _ in lines:
        if len(cells) >= 3:
            gaps = [cells[i + 1][0] - cells[i][0] for i in range(len(cells) - 1)]
            if gaps and median(gaps) >= 60:
                xs.extend(x for x, _ in cells)
    clusters: list[list[float]] = []
    for x in sorted(xs):
        for c in clusters:
            if abs(c[-1] - x) < 12:
                c.append(x)
                break
        else:
            clusters.append([x])
    columns = sorted(sum(c) / len(c) for c in clusters if len(c) >= 8)
    return columns if len(columns) >= 4 else []


def column_count_in_line(cells, columns):
    hit = set()
    for x, _ in cells:
        idx = min(range(len(columns)), key=lambda i: abs(columns[i] - x))
        if abs(columns[idx] - x) < 30:
            hit.add(idx)
    return hit


def build_table(run, columns):
    rows: list[list[list[str]]] = []
    current: list[list[str]] | None = None
    for cells, _ in run:
        row: list[list[str]] = [[] for _ in columns]
        for x, t in cells:
            idx = min(range(len(columns)), key=lambda i: abs(columns[i] - x))
            row[idx].append(t)
        filled = sum(1 for c in row if c)
        first_cell = " ".join(row[0]).strip()
        is_continuation_word = (
            current is not None
            and len(first_cell.split()) == 1
            and len(first_cell) <= 20
            and first_cell[:1].islower()
        )
        is_new = bool(row[0]) and filled >= 2 and not is_continuation_word
        if is_new or current is None:
            current = row
            rows.append(current)
        else:
            for i, cell_parts in enumerate(row):
                current[i].extend(cell_parts)
    rows = [r for r in rows if any(r)]
    if not rows:
        return ""
    header_text = " ".join(" ".join(c) for c in rows[0]).lower()
    deduped = [rows[0]]
    for r in rows[1:]:
        text = " ".join(" ".join(c) for c in r).lower()
        if text != header_text:
            deduped.append(r)
    header, body_rows = deduped[0], deduped[1:]
    out = ["<table>", "<thead><tr>"]
    for cell_parts in header:
        out.append(f"<th>{html.escape(' '.join(cell_parts))}</th>")
    out.append("</tr></thead><tbody>")
    for r in body_rows:
        out.append("<tr>")
        for cell_parts in r:
            out.append(f"<td>{html.escape(' '.join(cell_parts))}</td>")
        out.append("</tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def is_heading(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 100:
        return False
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return False
    upper = sum(1 for c in letters if c.isupper())
    return upper / len(letters) > 0.85 and not s.startswith("—")


def render_pdf(path: str) -> str:
    lines = extract_lines(PdfReader(path))
    columns = detect_columns(lines)
    parts: list[str] = []
    i = 0
    in_list = False
    while i < len(lines):
        cells, merged = lines[i]
        if columns and len(column_count_in_line(cells, columns)) >= 2:
            run = []
            j = i
            while j < len(lines):
                c2, m2 = lines[j]
                hits = column_count_in_line(c2, columns)
                if len(hits) >= 2:
                    run.append(lines[j])
                    j += 1
                    continue
                if (
                    len(c2) == 1
                    and run
                    and len(m2) <= 45
                    and (abs(c2[0][0] - columns[0]) < 15 or abs(c2[0][0] - columns[-1]) < 30)
                ):
                    run.append(lines[j])
                    j += 1
                    continue
                break
            table_html = build_table(run, columns)
            if "✅" in table_html or re.search(r"<t[dh]>—</t[dh]>", table_html):
                if in_list:
                    parts.append("</ul>")
                    in_list = False
                parts.append(table_html)
                i = j
                continue
            for cells2, merged2 in run:
                parts.append(f"<p>{html.escape(merged2)}</p>")
            i = j
            continue
        line = merged
        if is_heading(line) and len(line) > 3:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h2>{html.escape(line)}</h2>")
        elif line.startswith("—") or line.startswith("•"):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{html.escape(line.lstrip('—• ').strip())}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<p>{html.escape(line)}</p>")
        i += 1
    if in_list:
        parts.append("</ul>")
    body = "\n".join(parts)
    for src, dst in PLACEHOLDERS.items():
        body = body.replace(src, dst)
    body = re.sub(r"<p>КПП \(для юрлиц\)[^<]*</p>\n?", "", body)
    return body


def main() -> None:
    os.makedirs("src/web/legal", exist_ok=True)
    for slug, (path, title) in FILES.items():
        body = render_pdf(path)
        out = TEMPLATE.format(title=html.escape(title), body=body)
        with open(f"src/web/legal/{slug}.html", "w", encoding="utf-8") as fh:
            fh.write(out)
        print(slug, "ok", len(out), f"tables={body.count('<table>')}")


if __name__ == "__main__":
    main()
